import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { UserRole } from '@pos/database';
import { WOO_GATEWAY, type WooGateway } from './woo-gateway.interface';
import { WooConfigService } from './woo-config.service';
import { WooCatalogSyncService } from './woo-catalog-sync.service';
import { SyncLogService } from './sync-log.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

class StoreIdDto {
  @IsString()
  @MinLength(1)
  storeId!: string;
}

@Controller('integrations/woocommerce')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class WooIntegrationController {
  constructor(
    @Inject(WOO_GATEWAY) private readonly gateway: WooGateway,
    private readonly wooConfigService: WooConfigService,
    private readonly catalogSyncService: WooCatalogSyncService,
    private readonly syncLogService: SyncLogService,
  ) {}

  @Post('test-connection')
  async testConnection(@CurrentUser() user: AuthUser, @Body() dto: StoreIdDto) {
    const tenantId = requireTenant(user);
    const config = await this.wooConfigService.getCredentialForStore(
      tenantId,
      dto.storeId,
    );
    try {
      const result = await this.gateway.testConnection({
        apiUrl: config.apiUrl,
        consumerKey: config.consumerKey,
        consumerSecret: config.consumerSecret,
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }

  @Post('sync-catalog')
  syncCatalog(@CurrentUser() user: AuthUser, @Body() dto: StoreIdDto) {
    return this.catalogSyncService.syncCatalog(
      requireTenant(user),
      dto.storeId,
    );
  }

  @Get('sync-logs')
  findSyncLogs(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.syncLogService.findRecent(
      requireTenant(user),
      limit ? Number(limit) : undefined,
    );
  }

  @Post('sync-logs/:id/retry')
  retrySyncLog(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.syncLogService.retry(requireTenant(user), id);
  }
}
