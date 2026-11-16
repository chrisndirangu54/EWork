import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { verifyFirebaseIdToken } from '../security/firebase-id-token';

/**
 * No arbitrary ID/email bearer tokens, and no first-user fallback.
 * Production requires FIREBASE_PROJECT_ID matching the configured frontend Firebase project.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer [^ ]+$/.test(authorization)) {
      throw new UnauthorizedException('Firebase ID token required');
    }
    try {
      const claims = await verifyFirebaseIdToken(authorization.slice(7), process.env.FIREBASE_PROJECT_ID || '');
      if (typeof claims.email !== 'string' || claims.email_verified !== true) {
        throw new UnauthorizedException('A verified email address is required');
      }
      // Firebase UID is the only trusted identifier. A verified email can be linked once to a legacy user.
      let user = await this.prisma.user.findUnique({ where: { firebaseUid: claims.sub } });
      if (!user) {
        const legacy = await this.prisma.user.findUnique({ where: { email: claims.email } });
        if (legacy?.firebaseUid && legacy.firebaseUid !== claims.sub) {
          throw new UnauthorizedException('Account is linked to a different identity');
        }
        if (legacy) {
          user = await this.prisma.user.update({
            where: { id: legacy.id }, data: { firebaseUid: claims.sub, emailVerified: true },
          });
        } else {
          user = await this.prisma.user.create({
            data: { firebaseUid: claims.sub, email: claims.email, name: claims.name || claims.email,
              emailVerified: true, role: 'FREELANCER' },
          });
        }
      }
      if (user.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');
      if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account inactive');
      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }
  }
}
