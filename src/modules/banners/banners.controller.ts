import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { BannersService } from './banners.service';

@Controller('banners')
@UseGuards(JwtAuthGuard)
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  findActive(@CurrentUser() user: JwtPayload) {
    return this.bannersService.findActive(user);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bannersService.dismiss(id, user);
  }
}
