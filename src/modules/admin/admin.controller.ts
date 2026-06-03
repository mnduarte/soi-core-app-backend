import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { UpdateClinicSubscriptionDto, CreateBannerDto } from './dto/admin.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('clinics')
  findAllClinics(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.findAllClinics(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('clinics/:id')
  findClinic(@Param('id') id: string) {
    return this.adminService.findClinicById(id);
  }

  @Patch('clinics/:id/subscription')
  updateSubscription(@Param('id') id: string, @Body() dto: UpdateClinicSubscriptionDto) {
    return this.adminService.updateClinicSubscription(id, dto);
  }

  @Get('banners')
  findAllBanners() {
    return this.adminService.findAllBanners();
  }

  @Post('banners')
  createBanner(@Body() dto: CreateBannerDto) {
    return this.adminService.createBanner(dto);
  }

  @Delete('banners/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBanner(@Param('id') id: string) {
    return this.adminService.deleteBanner(id);
  }
}
