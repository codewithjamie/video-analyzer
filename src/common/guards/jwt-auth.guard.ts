import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw new UnauthorizedException({
        message: 'Authentication required. Please provide a valid JWT token.',
        hint: 'Include header: Authorization: Bearer <your_token>',
      });
    }
    return user;
  }
}