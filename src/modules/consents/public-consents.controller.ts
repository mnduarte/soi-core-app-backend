import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConsentsService } from './consents.service';
import { SignConsentDto } from './dto/consent.dto';

/**
 * La ÚNICA superficie de la app sin sesión.
 *
 * Existe para que el paciente firme desde su celular con un link que le llega
 * por WhatsApp. Tres cosas la sostienen y ninguna es opcional:
 *
 *  · El token es la credencial. Aleatorio de 32 bytes, guardado hasheado, de
 *    un solo uso y con vencimiento a las 48 horas.
 *  · Devuelve el mínimo: el texto a firmar, el nombre del paciente y el del
 *    consultorio. Ni el DNI, ni el resto de la ficha, ni otros pacientes.
 *  · Con límite de intentos, porque es lo único que se puede golpear sin
 *    estar logueado.
 *
 * No hereda de ConsentsController a propósito: aquel está bajo
 * `/patients/:patientId/...` con JwtAuthGuard, y mezclar las dos superficies
 * es la clase de error que se paga caro.
 */
@Controller('public/consents')
@UseGuards(ThrottlerGuard)
export class PublicConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  @Get(':token')
  ver(@Param('token') token: string) {
    return this.consentsService.verPorToken(token);
  }

  @Post(':token/sign')
  @HttpCode(HttpStatus.OK)
  firmar(@Param('token') token: string, @Body() dto: SignConsentDto) {
    return this.consentsService.firmarPorToken(token, dto);
  }
}
