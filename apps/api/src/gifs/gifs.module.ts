import { Module } from '@nestjs/common';
import { GifsController } from './gifs.controller';
import { GifsService } from './gifs.service';

/** Buscador de GIFs para el chat (proveedor: GIPHY). */
@Module({
  controllers: [GifsController],
  providers: [GifsService],
  // ChatModule: valida el GIF de un mensaje por su id.
  exports: [GifsService],
})
export class GifsModule {}
