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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { PriceCatalogService } from './price-catalog.service';
import { CreatePriceCatalogItemDto } from './dto/create-price-catalog-item.dto';

@Controller('price-catalog')
@UseGuards(JwtAuthGuard)
export class PriceCatalogController {
  constructor(private readonly priceCatalogService: PriceCatalogService) {}

  @Post()
  create(
    @ClinicId() clinicId: string,
    @Body() dto: CreatePriceCatalogItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.priceCatalogService.create(clinicId, dto, user);
  }

  @Get()
  findAll(@ClinicId() clinicId: string, @Query('category') category?: string) {
    return this.priceCatalogService.findAll(clinicId, category);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.priceCatalogService.findById(clinicId, id);
  }

  @Patch(':id')
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePriceCatalogItemDto>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.priceCatalogService.update(clinicId, id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.priceCatalogService.softDelete(clinicId, id, user);
  }
}
