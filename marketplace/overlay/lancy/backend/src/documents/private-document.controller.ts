import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrivateDocumentService } from './private-document.service';

@ApiTags('private-documents')
@Controller('api/v1/private-documents')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class PrivateDocumentController {
  constructor(private readonly service: PrivateDocumentService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('scope') scope: string,
     @Query('resourceId') resourceId: string) {
    return this.service.list(user, scope, resourceId);
  }

  @Post()
  async upload(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string,unknown>) {
    return this.service.upload(user, body);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string,
     @Res() response: Response) {
    const file = await this.service.download(user, id);
    const filename = file.filename.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/"/g, '_');
    response.setHeader('Content-Type','application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.send(file.content);
  }
}
