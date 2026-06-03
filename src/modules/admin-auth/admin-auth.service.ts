import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AdminUser, AdminUserDocument } from './schemas/admin-user.schema';
import { AdminLoginDto } from './dto/admin-login.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
    private jwtService: JwtService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.adminUserModel
      .findOne({ email: dto.email.toLowerCase(), isActive: true })
      .exec();

    if (!admin) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await argon2.verify(admin.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const payload = { sub: admin._id.toString(), email: admin.email, role: 'SUPERADMIN' };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken, admin: { id: admin._id, email: admin.email, role: admin.role } };
  }
}
