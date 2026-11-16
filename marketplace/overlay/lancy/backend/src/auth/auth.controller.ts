import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  // Previous public sync accepted an arbitrary requested role (including ADMIN).
  // Verified identity provisioning now happens inside FirebaseAuthGuard.
  @Post('sync')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  async sync(@CurrentUser() user: AuthenticatedUser) {
    return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
  }
}
