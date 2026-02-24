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
  }): Promise<SessionEntity> {
    const session = this.sessionRepo.create({
      stationId: data.stationId,
      scenarioId: data.scenarioId,
      scenarioName: data.scenarioName,
      studentName: data.studentName,
      initialSettings: data.initialSettings,
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
}
