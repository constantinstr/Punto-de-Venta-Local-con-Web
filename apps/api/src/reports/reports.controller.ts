import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@pos/database';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';
import { ReportRangeQueryDto } from './dto/report-range-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';
import { ExportExcelQueryDto } from './dto/export-excel-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

// Todo el módulo de reportes queda restringido a dueño/admin — un cajero no
// tiene por qué ver márgenes de ganancia ni facturación consolidada del
// negocio (ver objetivos de Sprint 8, punto 3).
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ReportsExportService,
  ) {}

  @Get('sales-summary')
  salesSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reportsService.salesSummary(requireTenant(user), query);
  }

  @Get('payment-methods')
  paymentMethods(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reportsService.paymentMethods(requireTenant(user), query);
  }

  @Get('top-products')
  topProducts(
    @CurrentUser() user: AuthUser,
    @Query() query: TopProductsQueryDto,
  ) {
    return this.reportsService.topProducts(requireTenant(user), query);
  }

  @Get('cash-shifts-history')
  cashShiftsHistory(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reportsService.cashShiftsHistory(requireTenant(user), query);
  }

  @Get('export/excel')
  async exportExcel(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportExcelQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.buildExcel(
      requireTenant(user),
      query.type,
      query,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reporte-${query.type}-${query.from}_${query.to}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get('export/pdf')
  async exportPdf(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportRangeQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.buildExecutivePdf(
      requireTenant(user),
      query,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="resumen-ejecutivo-${query.from}_${query.to}.pdf"`,
    );
    res.send(buffer);
  }
}
