import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CashShiftsService } from './cash-shifts.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

@Controller('cash-shifts')
@UseGuards(JwtAuthGuard)
export class CashShiftsController {
  constructor(private readonly cashShiftsService: CashShiftsService) {}

  @Post('open')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenShiftDto) {
    return this.cashShiftsService.open(requireTenant(user), user, dto);
  }

  // Declarado antes de ':id' — si no, Nest lo confunde con /cash-shifts/:id.
  @Get('current')
  getCurrent(
    @CurrentUser() user: AuthUser,
    @Query('cashRegisterId') cashRegisterId: string,
  ) {
    return this.cashShiftsService.getCurrent(
      requireTenant(user),
      cashRegisterId,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cashShiftsService.findOne(requireTenant(user), user, id);
  }

  @Get(':id/summary')
  getSummary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cashShiftsService.getSummary(requireTenant(user), user, id);
  }

  @Get(':id/movements')
  listMovements(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cashShiftsService.listMovements(requireTenant(user), user, id);
  }

  @Post(':id/movements')
  addMovement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateMovementDto,
  ) {
    return this.cashShiftsService.addMovement(
      requireTenant(user),
      user,
      id,
      dto,
    );
  }

  @Post(':id/close')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.cashShiftsService.close(requireTenant(user), user, id, dto);
  }
}
