import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@pos/database';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { FindQuotesQueryDto } from './dto/find-quotes-query.dto';
import { QuotesService } from './quotes.service';
import { QuotePdfService } from './quote-pdf.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

// Presupuestos son una herramienta de venta consultiva (armar una cotización
// para que el cliente se lleve o compare precios), no del mostrador rápido —
// a diferencia de una venta, no hay apuro por cerrarla ahí mismo. Se reserva
// a OWNER/ADMIN/MANAGER: un CASHIER vende y cobra, pero no arma presupuestos.
@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly quotePdfService: QuotePdfService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: FindQuotesQueryDto) {
    return this.quotesService.findAll(requireTenant(user), query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuoteDto) {
    return this.quotesService.create(requireTenant(user), user, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotesService.findOne(requireTenant(user), id);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.quotePdfService.buildPdf(requireTenant(user), id);
    if (!buffer) throw new NotFoundException('Presupuesto no encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="presupuesto-${id}.pdf"`,
    );
    res.send(buffer);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotesService.cancel(requireTenant(user), user, id);
  }
}
