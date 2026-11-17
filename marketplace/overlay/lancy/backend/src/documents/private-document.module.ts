import { Module } from '@nestjs/common';
import { PrivateDocumentService } from './private-document.service';
import { PrivateDocumentController } from './private-document.controller';
@Module({ controllers: [PrivateDocumentController], providers: [PrivateDocumentService] })
export class PrivateDocumentModule {}
