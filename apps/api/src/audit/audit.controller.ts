import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@pos/database';
import { AuditService } from './audit.service';
import { FindAuditQueryDto } from './dto/find-audit-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: FindAuditQueryDto) {
    return this.auditService.findAll(requireTenant(user), query);
  }
}
