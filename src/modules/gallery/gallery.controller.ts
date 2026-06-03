import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { GalleryService } from './gallery.service';
import { CreateGallerySessionDto, AddPhotoDto } from './dto/gallery.dto';

@Controller('patients/:patientId/gallery')
@UseGuards(JwtAuthGuard)
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get('upload-params')
  getUploadParams(@ClinicId() clinicId: string) {
    return this.galleryService.getSignedUploadParams(clinicId);
  }

  @Post('sessions')
  createSession(
    @ClinicId() clinicId: string,
    @Param('patientId') patientId: string,
    @Body() dto: CreateGallerySessionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.galleryService.createSession(clinicId, patientId, dto, user);
  }

  @Get('sessions')
  findSessions(@ClinicId() clinicId: string, @Param('patientId') patientId: string) {
    return this.galleryService.findSessions(clinicId, patientId);
  }

  @Get('sessions/:sessionId')
  findSession(@ClinicId() clinicId: string, @Param('sessionId') sessionId: string) {
    return this.galleryService.findSession(clinicId, sessionId);
  }

  @Post('sessions/:sessionId/photos')
  addPhoto(
    @ClinicId() clinicId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AddPhotoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.galleryService.addPhoto(clinicId, sessionId, dto, user);
  }

  @Delete('sessions/:sessionId/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePhoto(
    @ClinicId() clinicId: string,
    @Param('sessionId') sessionId: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.galleryService.removePhoto(clinicId, sessionId, photoId, user);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSession(
    @ClinicId() clinicId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.galleryService.softDeleteSession(clinicId, sessionId, user);
  }
}
