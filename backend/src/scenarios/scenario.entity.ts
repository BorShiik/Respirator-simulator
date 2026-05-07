import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { AsynchronyType } from '../common/dto/ventilator.dto';

export type BlockType = 'NORMAL' | 'ASYNCHRONY';

export interface ScenarioBlock {
  id: string;
  type: BlockType;
  startTime: number;
  duration: number;
  description: string;
  parameterChanges: Record<string, number>;
  asynchronyType?: AsynchronyType;
  resistance?: number;
  compliance?: number;
  // Patient parameters (ILSim-style)
  rin?: number;
  rout?: number;
  p01?: number;
  Tcykl?: number;
  PTi?: number;
  PriorityPR?: number;
  PressureRaiseT?: number;
  DoubleTriggeringTime?: number;
  knobDisable?: boolean;
}

@Entity('scenarios')
export class ScenarioEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'simple-json', nullable: true })
  blocks: ScenarioBlock[];

  @Column({ default: 300 }) // 5 minutes default
  durationSeconds: number;

  @Column({ type: 'simple-json', nullable: true })
  initialSettings: Record<string, number>;

  @Column({ type: 'float', default: 10 })
  initialResistance: number;

  @Column({ type: 'float', default: 50 })
  initialCompliance: number;

  @Column({ type: 'simple-json', nullable: true })
  initialPatientParams: Record<string, number | boolean> | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

