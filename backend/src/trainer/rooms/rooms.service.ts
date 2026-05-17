import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomEntity } from './entities/room.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepository: Repository<RoomEntity>,
  ) {}

  async create(name: string): Promise<RoomEntity> {
    const code = this.generateCode();
    const room = this.roomRepository.create({
      name,
      code,
      isActive: true,
    });
    return await this.roomRepository.save(room);
  }

  async findAllActive(): Promise<RoomEntity[]> {
    return await this.roomRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<RoomEntity[]> {
    return await this.roomRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findByCode(code: string): Promise<RoomEntity | null> {
    return await this.roomRepository.findOne({ where: { code } });
  }

  async close(id: string): Promise<RoomEntity> {
    const room = await this.roomRepository.findOne({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    room.isActive = false;
    return await this.roomRepository.save(room);
  }

  private generateCode(): string {
    // Generate a 6-digit random code
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
