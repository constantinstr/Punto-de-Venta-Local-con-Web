import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, SupportMessageStatus } from '@pos/database';
import type { CreateSupportMessageDto } from './dto/create-support-message.dto';
import type { AuthUser } from '../common/types/auth-user';
import { SupportMailerService } from './support-mailer.service';

@Injectable()
export class SupportService {
  constructor(private readonly mailer: SupportMailerService) {}

  // SupportMessage no tiene RLS (ver el comentario en el schema) — es la
  // bandeja de entrada global del dueño del SaaS, no un dato de un tenant en
  // el sentido multi-tenant habitual, así que se escribe con el `prisma`
  // plano, igual que RefreshToken.
  async create(user: AuthUser, dto: CreateSupportMessageDto) {
    const message = await prisma.supportMessage.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        contactEmail: user.email,
        category: dto.category,
        subject: dto.subject,
        message: dto.message,
      },
    });

    // Best-effort, nunca bloquea la respuesta al usuario: el mensaje ya está
    // guardado y visible en /platform/support-messages pase lo que pase acá.
    void this.mailer.notifyNewMessage(message);

    return message;
  }

  // ── Plataforma (SUPERADMIN) ───────────────────────────────────────────────

  async listForPlatform(status?: SupportMessageStatus) {
    return prisma.supportMessage.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { name: true } } },
    });
  }

  async resolve(id: string) {
    const existing = await prisma.supportMessage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Mensaje no encontrado');
    return prisma.supportMessage.update({
      where: { id },
      data: { status: SupportMessageStatus.RESOLVED },
    });
  }
}
