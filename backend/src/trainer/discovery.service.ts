import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as dgram from 'dgram';
import * as os from 'os';

/**
 * Trainer Discovery Service
 * 
 * Periodically broadcasts a UDP beacon so that Student Pi's
 * on the same network can auto-discover the Trainer without
 * manually specifying TRAINER_URL.
 * 
 * Protocol:
 *   - Port: 41234 (UDP)
 *   - Interval: 3 seconds
 *   - Payload: JSON { type: "trainer_beacon", wsUrl, apiUrl, trainerName, timestamp }
 */

export const DISCOVERY_PORT = 41234;
const BEACON_INTERVAL_MS = 3000;

@Injectable()
export class DiscoveryService implements OnModuleInit, OnModuleDestroy {
  private socket: dgram.Socket | null = null;
  private interval: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(DiscoveryService.name);

  onModuleInit() {
    this.startBroadcasting();
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Get all non-internal IPv4 interfaces with their calculated broadcast addresses
   */
  private getLocalInterfaces(): { ip: string, broadcast: string }[] {
    const interfaces = os.networkInterfaces();
    const results: { ip: string, broadcast: string }[] = [];
    
    const getBroadcast = (ip: string, netmask: string) => {
      const ipParts = ip.split('.').map(Number);
      const maskParts = netmask.split('.').map(Number);
      return ipParts.map((part, i) => part | (~maskParts[i] & 255)).join('.');
    };

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          results.push({
            ip: iface.address,
            broadcast: getBroadcast(iface.address, iface.netmask)
          });
        }
      }
    }
    // Always append localhost as a fallback for local development
    if (!results.some(r => r.ip === '127.0.0.1')) {
      results.push({ ip: '127.0.0.1', broadcast: '127.255.255.255' });
    }
    return results;
  }

  private startBroadcasting() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('error', (err) => {
      this.logger.error(`Discovery socket error: ${err.message}`);
    });

    // Bind to an ephemeral port (we only send, students listen on DISCOVERY_PORT)
    this.socket.bind(() => {
      this.socket!.setBroadcast(true);

      const port = process.env.PORT || 8081;
      const ifaces = this.getLocalInterfaces();

      if (ifaces.length === 0) {
        this.logger.warn('No network interfaces found! Discovery beacon will not work.');
        return;
      }

      this.logger.log(`📡 Trainer discovery beacon started`);
      this.logger.log(`   Broadcasting on UDP port ${DISCOVERY_PORT} every ${BEACON_INTERVAL_MS / 1000}s`);
      this.logger.log(`   Trainer IPs: ${ifaces.map(i => i.ip).join(', ')}`);

      // Send first beacon immediately
      this.sendBeacon(ifaces, port);

      // Then every BEACON_INTERVAL_MS
      this.interval = setInterval(() => {
        // Re-read IPs in case network changes
        const currentIfaces = this.getLocalInterfaces();
        if (currentIfaces.length > 0) {
          this.sendBeacon(currentIfaces, port);
        }
      }, BEACON_INTERVAL_MS);
    });
  }

  private sendBeacon(ifaces: { ip: string, broadcast: string }[], port: string | number) {
    const primaryIP = ifaces[0].ip;
    const ips = ifaces.map(i => i.ip);

    const beacon = JSON.stringify({
      type: 'trainer_beacon',
      wsUrl: `ws://${primaryIP}:${port}/api/trainer/ws`,
      apiUrl: `http://${primaryIP}:${port}`,
      trainerName: os.hostname(),
      trainerIPs: ips,
      timestamp: Date.now(),
    });

    const message = Buffer.from(beacon);

    // 1. Send to global broadcast address
    this.socket!.send(message, 0, message.length, DISCOVERY_PORT, '255.255.255.255', (err) => {
      if (err) {
        this.logger.error(`Beacon send error (global): ${err.message}`);
      }
    });

    // 2. Send to specific subnet broadcasts (Fixes Windows routing to wrong interface)
    for (const iface of ifaces) {
      if (iface.broadcast !== '255.255.255.255') {
        this.socket!.send(message, 0, message.length, DISCOVERY_PORT, iface.broadcast, () => {});
      }
    }

    // 3. Also send specifically to localhost to ensure local development works
    this.socket!.send(message, 0, message.length, DISCOVERY_PORT, '127.0.0.1', () => {});
  }
}
