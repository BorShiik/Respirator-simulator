import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { AsynchronyType } from '../common/dto/ventilator.dto';

// Event types in a scenario
export interface ScenarioEvent {
  time: number;           // Time in seconds from start
  type: 'asynchrony' | 'message' | 'setting_change';
  asynchronyType?: AsynchronyType;
  message?: string;
  settingChange?: {
    parameter: string;
    value: number;
  };
  duration?: number;      // Duration of the event in seconds
}

@Entity('scenarios')
export class ScenarioEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'simple-json' })
  events: ScenarioEvent[];

  @Column({ default: 300 }) // 5 minutes default
  durationSeconds: number;

  @Column({ type: 'simple-json', nullable: true })
  initialSettings: Record<string, number>;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
