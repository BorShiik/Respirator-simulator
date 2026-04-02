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
   * Get all non-internal IPv4 addresses of this machine
   */
  private getLocalIPs(): string[] {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
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
      const ips = this.getLocalIPs();

      if (ips.length === 0) {
        this.logger.warn('No network interfaces found! Discovery beacon will not work.');
        return;
      }

      this.logger.log(`📡 Trainer discovery beacon started`);
      this.logger.log(`   Broadcasting on UDP port ${DISCOVERY_PORT} every ${BEACON_INTERVAL_MS / 1000}s`);
      this.logger.log(`   Trainer IPs: ${ips.join(', ')}`);

      // Send first beacon immediately
      this.sendBeacon(ips, port);

      // Then every BEACON_INTERVAL_MS
      this.interval = setInterval(() => {
        // Re-read IPs in case network changes
        const currentIPs = this.getLocalIPs();
        if (currentIPs.length > 0) {
          this.sendBeacon(currentIPs, port);
        }
      }, BEACON_INTERVAL_MS);
    });
  }

  private sendBeacon(ips: string[], port: string | number) {
    const primaryIP = ips[0];
    const beacon = JSON.stringify({
      type: 'trainer_beacon',
      wsUrl: `ws://${primaryIP}:${port}/api/trainer/ws`,
      apiUrl: `http://${primaryIP}:${port}`,
      trainerName: os.hostname(),
      trainerIPs: ips,
      timestamp: Date.now(),
    });

    const message = Buffer.from(beacon);

    // Send to broadcast address
    this.socket!.send(message, 0, message.length, DISCOVERY_PORT, '255.255.255.255', (err) => {
      if (err) {
        this.logger.error(`Beacon send error: ${err.message}`);
      }
    });
  }
}
