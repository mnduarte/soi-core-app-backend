import {
  Controller,
  Get,
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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @ClinicId() clinicId: string,
    @Query('isClinical') isClinical?: string,
  ) {
    const clinical =
      isClinical === 'true' ? true : isClinical === 'false' ? false : undefined;
    return this.usersService.findAll(clinicId, clinical);
  }

  // Returns the current authenticated user. Used by core-app-frontend after
  // impersonation to render the doctor's name in the banner without having to
  // decode the JWT for anything other than ids.
  @Get('me')
  getMe(
    @ClinicId() clinicId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.findById(clinicId, user.sub);
  }

  @Get(':id')
  findOne(@ClinicId() clinicId: string, @Param('id') id: string) {
    return this.usersService.findById(clinicId, id);
  }

  @Patch(':id')
  update(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(clinicId, id, dto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ClinicId() clinicId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.softDelete(clinicId, id, user);
  }
}
