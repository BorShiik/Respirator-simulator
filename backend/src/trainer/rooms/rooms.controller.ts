import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { RoomsService } from './rooms.service';

@Controller('trainer/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async create(@Body() createRoomDto: { name: string }) {
    return await this.roomsService.create(createRoomDto.name);
  }

  @Get()
  async findAll() {
    return await this.roomsService.findAll();
  }

  @Patch(':id/close')
  async close(@Param('id') id: string) {
    return await this.roomsService.close(id);
  }
}
