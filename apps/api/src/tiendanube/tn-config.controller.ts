import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@pos/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';
import { TnConfigService } from './tn-config.service';
import { TnCatalogSyncService } from './tn-catalog-sync.service';
import { TnWebhookRegistrarService } from './tn-webhook-registrar.service';
import { UpdateTnConfigDto } from './dto/update-tn-config.dto';

@Controller('tiendanube-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TnConfigController {
  constructor(
    private readonly tnConfigService: TnConfigService,
    private readonly catalogSync: TnCatalogSyncService,
    private readonly webhookRegistrar: TnWebhookRegistrarService,
  ) {}

  // Devuelve null (no 404) cuando el local no tiene Tienda Nube conectada:
  // no es un error, es el estado inicial normal, y el hub de configuración
  // necesita distinguir "sin configurar" de "falló la consulta".
  @Get()
  findByStore(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
  ) {
    return this.tnConfigService.findByStore(requireTenant(user), storeId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTnConfigDto,
  ) {
    return this.tnConfigService.update(requireTenant(user), id, dto);
  }

  @Post('test-connection')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  testConnection(
    @CurrentUser() user: AuthUser,
    @Body('storeId') storeId: string,
  ) {
    return this.tnConfigService.testConnection(requireTenant(user), storeId);
  }

  @Post('sync-catalog')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  syncCatalog(@CurrentUser() user: AuthUser, @Body('storeId') storeId: string) {
    return this.catalogSync.syncCatalog(requireTenant(user), storeId);
  }

  // Reintento manual del alta de webhooks. Se registran solos al conectar,
  // pero eso es best-effort: si Tienda Nube estaba caída en ese momento, o si
  // cambió API_PUBLIC_URL (mudanza de servidor), desde acá se vuelven a poner
  // sin tener que desconectar y reconectar la tienda.
  @Post('register-webhooks')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async registerWebhooks(
    @CurrentUser() user: AuthUser,
    @Body('storeId') storeId: string,
  ) {
    const tenantId = requireTenant(user);
    const resolved = await this.tnConfigService.getCredential(
      tenantId,
      storeId,
    );
    if (!resolved) {
      throw new NotFoundException('Este local no tiene Tienda Nube conectada');
    }
    return this.webhookRegistrar.sync(
      tenantId,
      resolved.config.id,
      resolved.credential,
    );
  }
}
