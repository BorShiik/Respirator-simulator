import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionEntity, SessionLogEntity } from './session.entity';
import { VentilatorSettings, AsynchronyType } from '../common/dto/ventilator.dto';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(SessionLogEntity)
    private readonly logRepo: Repository<SessionLogEntity>,
  ) {}

  async create(data: {
    stationId: string;
    scenarioId?: string;
    scenarioName?: string;
    studentName?: string;
    initialSettings?: VentilatorSettings;
    roomId?: string;
  }): Promise<SessionEntity> {
    const session = this.sessionRepo.create({
      stationId: data.stationId,
      scenarioId: data.scenarioId,
      scenarioName: data.scenarioName,
      studentName: data.studentName,
      initialSettings: data.initialSettings,
      roomId: data.roomId,
      status: 'pending',
    });
    return this.sessionRepo.save(session);
  }

  async start(sessionId: string): Promise<SessionEntity | null> {
    await this.sessionRepo.update(sessionId, {
      status: 'running',
      startedAt: new Date(),
    });
    return this.findById(sessionId);
  }

  async complete(sessionId: string, finalSettings: VentilatorSettings): Promise<SessionEntity | null> {
    const session = await this.findById(sessionId);
    if (!session) return null;

    await this.sessionRepo.update(sessionId, {
      status: 'completed',
      endedAt: new Date(),
      finalSettings,
    });
    return this.findById(sessionId);
  }

  async abort(sessionId: string): Promise<void> {
    await this.sessionRepo.update(sessionId, {
      status: 'aborted',
      endedAt: new Date(),
    });
  }

  async findById(id: string): Promise<SessionEntity | null> {
    return this.sessionRepo.findOne({ where: { id }, relations: ['logs'] });
  }

  async findByStation(stationId: string): Promise<SessionEntity[]> {
    return this.sessionRepo.find({
      where: { stationId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findActiveSession(stationId: string): Promise<SessionEntity | null> {
    return this.sessionRepo.findOne({
      where: { stationId, status: 'running' },
    });
  }

  async findPendingSession(stationId: string): Promise<SessionEntity | null> {
    return this.sessionRepo.findOne({
      where: { stationId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  // Logging methods
  async logSettingChange(
    sessionId: string,
    parameter: string,
    previousValue: number,
    newValue: number,
    wasAsynchronyActive: boolean,
    asynchronyType?: AsynchronyType,
  ): Promise<SessionLogEntity> {
    const log = this.logRepo.create({
      sessionId,
      timestamp: Date.now(),
      eventType: 'setting_change',
      parameter,
      previousValue,
      newValue,
      wasAsynchronyActive,
      asynchronyType,
    });

    // Update session counter
    await this.sessionRepo.increment({ id: sessionId }, 'totalSettingChanges', 1);

    return this.logRepo.save(log);
  }

  async logAsynchronyStart(sessionId: string, type: AsynchronyType): Promise<SessionLogEntity> {
    const log = this.logRepo.create({
      sessionId,
      timestamp: Date.now(),
      eventType: 'asynchrony_start',
      asynchronyType: type,
      wasAsynchronyActive: true,
    });
    return this.logRepo.save(log);
  }

  async logAsynchronyEnd(sessionId: string, type: AsynchronyType): Promise<SessionLogEntity> {
    const log = this.logRepo.create({
      sessionId,
      timestamp: Date.now(),
      eventType: 'asynchrony_end',
      asynchronyType: type,
      wasAsynchronyActive: false,
    });

    // Update resolved counter
    await this.sessionRepo.increment({ id: sessionId }, 'asynchronyResolvedCount', 1);

    return this.logRepo.save(log);
  }

  async getSessionLogs(sessionId: string): Promise<SessionLogEntity[]> {
    return this.logRepo.find({
      where: { sessionId },
      order: { timestamp: 'ASC' },
    });
  }

  // Analytics
  async getSessionAnalytics(sessionId: string): Promise<{
    totalChanges: number;
    changesPerMinute: number;
    timeToFirstCorrection: number | null;
    settingChangesByParameter: Record<string, number>;
  }> {
    const session = await this.findById(sessionId);
    if (!session) throw new Error('Session not found');

    const logs = await this.getSessionLogs(sessionId);
    const settingChanges = logs.filter(l => l.eventType === 'setting_change');

    const duration = session.endedAt
      ? (session.endedAt.getTime() - session.startedAt.getTime()) / 60000
      : 1;

    const byParameter: Record<string, number> = {};
    for (const log of settingChanges) {
      if (log.parameter) {
        byParameter[log.parameter] = (byParameter[log.parameter] || 0) + 1;
      }
    }

    // Time to first correction after asynchrony started
    let timeToFirstCorrection: number | null = null;
    const firstAsynchrony = logs.find(l => l.eventType === 'asynchrony_start');
    if (firstAsynchrony) {
      const firstChange = logs.find(
        l => l.eventType === 'setting_change' && l.timestamp > firstAsynchrony.timestamp,
      );
      if (firstChange) {
        timeToFirstCorrection = (firstChange.timestamp - firstAsynchrony.timestamp) / 1000;
      }
    }

    return {
      totalChanges: session.totalSettingChanges,
      changesPerMinute: session.totalSettingChanges / duration,
      timeToFirstCorrection,
      settingChangesByParameter: byParameter,
    };
  }

  // === Full session list with computed metrics for Analytics dashboard ===

  async findAll(): Promise<SessionEntity[]> {
    return this.sessionRepo.find({
      relations: ['logs'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * Map a raw SessionEntity (with logs) into the shape the frontend analytics expects.
   */
  mapSessionToFrontend(session: SessionEntity): Record<string, unknown> {
    const logs = (session.logs || []).sort((a, b) => a.timestamp - b.timestamp);

    // Duration
    let totalDuration = 0;
    if (session.startedAt && session.endedAt) {
      totalDuration = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000);
    }

    // Setting changes
    const settingChanges = logs.filter(l => l.eventType === 'setting_change');
    const numberOfSettingChanges = settingChanges.length;

    // Asynchrony types encountered
    const asynchronyStartLogs = logs.filter(l => l.eventType === 'asynchrony_start');
    const asynchronyEndLogs = logs.filter(l => l.eventType === 'asynchrony_end');
    const asynchronyTypes = [...new Set(asynchronyStartLogs.map(l => l.asynchronyType).filter(Boolean))];

    // Time to resolve: time between first asynchrony_start and first asynchrony_end
    let timeToResolveAsynchrony: number | null = null;
    if (asynchronyStartLogs.length > 0 && asynchronyEndLogs.length > 0) {
      timeToResolveAsynchrony = Math.round(
        (asynchronyEndLogs[0].timestamp - asynchronyStartLogs[0].timestamp) / 1000,
      );
    }

    // Successful resolution: at least one asynchrony was resolved
    const successfulResolution = asynchronyEndLogs.length > 0;

    // Chaos index = (setting changes / duration in minutes). Capped at 1.0
    const durationMinutes = totalDuration > 0 ? totalDuration / 60 : 1;
    const chaosIndex = Math.min(1, Math.round((numberOfSettingChanges / durationMinutes) * 100) / 100);

    return {
      id: session.id,
      stationId: session.stationId,
      traineeId: session.studentName || session.stationId,
      traineeName: session.studentName || session.stationId,
      scenarioId: session.scenarioId || null,
      scenarioName: session.scenarioName || 'Free Practice',
      roomId: session.roomId || null,
      startTime: session.startedAt ? session.startedAt.getTime() : session.createdAt.getTime(),
      endTime: session.endedAt ? session.endedAt.getTime() : null,
      status: session.status === 'completed'
        ? 'COMPLETED'
        : session.status === 'running'
        ? 'IN_PROGRESS'
        : session.status === 'aborted'
        ? 'ABORTED'
        : 'PENDING',
      metrics: {
        totalDuration,
        timeToResolveAsynchrony,
        numberOfSettingChanges,
        chaosIndex,
        asynchronyDetected: asynchronyStartLogs.length > 0,
        asynchronyTypes,
        successfulResolution,
      },
    };
  }
}
