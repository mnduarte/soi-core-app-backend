import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LookupDto } from './dto/lookup.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('lookup')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  lookup(@Body() dto: LookupDto) {
    return this.authService.lookup(dto);
  }

  @Post('request-password-reset')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('setup-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  setupPassword(@Body() dto: SetupPasswordDto, @Req() req: Request) {
    return this.authService.setupPassword(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body('refreshToken') token: string,
    @Req() req: Request,
  ) {
    return this.authService.refresh(token, req.ip, req.headers['user-agent']);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body('refreshToken') token: string) {
    return this.authService.logout(token);
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.CREATED)
  acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() req: Request) {
    return this.authService.acceptInvitation(dto, req.ip, req.headers['user-agent']);
  }
}
