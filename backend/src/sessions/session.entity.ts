import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { VentilatorSettings, AsynchronyType } from '../common/dto/ventilator.dto';

@Entity('sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stationId: string;

  @Column({ nullable: true })
  scenarioId: string;

  @Column({ nullable: true })
  scenarioName: string;

  @Column({ nullable: true })
  studentName: string;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  endedAt: Date;

  @Column({ default: 'pending' })
  status: 'pending' | 'running' | 'completed' | 'aborted';

  @Column({ type: 'simple-json', nullable: true })
  initialSettings: VentilatorSettings;

  @Column({ type: 'simple-json', nullable: true })
  finalSettings: VentilatorSettings;

  @Column({ default: 0 })
  totalSettingChanges: number;

  @Column({ default: 0 })
  asynchronyResolvedCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => SessionLogEntity, (log) => log.session, { cascade: true })
  logs: SessionLogEntity[];
}

@Entity('session_logs')
export class SessionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SessionEntity, (session) => session.logs)
  session: SessionEntity;

  @Column()
  sessionId: string;

  @Column()
  timestamp: number; // Unix timestamp

  @Column()
  eventType: 'setting_change' | 'asynchrony_start' | 'asynchrony_end' | 'session_event';

  @Column({ nullable: true })
  parameter: string; // Which setting was changed

  @Column({ type: 'float', nullable: true })
  previousValue: number;

  @Column({ type: 'float', nullable: true })
  newValue: number;

  @Column({ nullable: true })
  asynchronyType: AsynchronyType;

  @Column({ default: false })
  wasAsynchronyActive: boolean;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
