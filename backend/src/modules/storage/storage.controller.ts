import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { StorageService } from './storage.service';
import { PresignUploadDto } from './dto/presign.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Public } from '../../common/decorators/public.decorator';

@Controller('uploads')
export class StorageController {
  constructor(private storageService: StorageService) {}

  @Post('presign')
  presign(@CurrentUser() user: AuthenticatedUser, @Body() dto: PresignUploadDto) {
    return this.storageService.createPresignedUpload(
      user.userId,
      dto.filename,
      dto.contentType,
      dto.purpose || 'withdrawal-payment-proof',
    );
  }

  /** Multipart upload via API (recommended — no browser→R2 CORS). */
  @Post('proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadProof(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('purpose') purpose?: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.storageService.uploadProofFile(
      user.userId,
      file,
      purpose || 'withdrawal-payment-proof',
    );
  }

  @Public()
  @Get('files/*path')
  async serveLocal(@Param('path') filePath: string | string[], @Res() res: Response) {
    const key = Array.isArray(filePath) ? filePath.join('/') : filePath;
    if (!key.startsWith('p2p/')) {
      throw new BadRequestException('Invalid path');
    }
    const buffer = await this.storageService.readLocalFile(key);
    const ext = key.split('.').pop()?.toLowerCase();
    const type =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  }
}
