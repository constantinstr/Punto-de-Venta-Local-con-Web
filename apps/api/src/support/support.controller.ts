import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';

// Sin @Roles a propósito: cualquier rol logueado puede tener una duda
// técnica o querer avisar que quiere pasar a Premium — hasta un CASHIER.
// '/support' está en ALWAYS_ALLOWED_PREFIXES de
// SubscriptionEnforcementInterceptor: un tenant demo BLOQUEADO tiene que
// poder seguir mandando este mensaje — es, literalmente, el único canal que
// le queda para salir del bloqueo.
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('messages')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupportMessageDto) {
    return this.supportService.create(user, dto);
  }
}
