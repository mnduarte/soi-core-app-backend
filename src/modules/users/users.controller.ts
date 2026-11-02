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
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateTourDto } from './dto/update-tour.dto';

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
  getMe(@ClinicId() clinicId: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.findById(clinicId, user.sub);
  }

  /* Las ayudas de primera vez. Cada uno escribe LO SUYO y nada más: el id
     sale del JWT, no de la URL, así que no hay forma de marcarle el recorrido
     a otro. Van antes de `:id` por claridad; Nest igual no las confunde,
     porque 'me/tour' tiene dos segmentos y ':id' uno. */
  @Patch('me/tour')
  updateTour(
    @ClinicId() clinicId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTourDto,
  ) {
    return this.usersService.updateTour(clinicId, user.sub, dto);
  }

  @Delete('me/tour')
  resetTour(@ClinicId() clinicId: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.resetTour(clinicId, user.sub);
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
