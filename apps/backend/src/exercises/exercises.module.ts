import { Module } from '@nestjs/common';

import { ExercisePdfController } from './exercise-pdf.controller';
import { ExercisePdfService } from './exercise-pdf.service';
import { ExerciseStorageService } from './exercise-storage.service';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';

@Module({
  controllers: [ExercisesController, ExercisePdfController],
  providers: [ExercisesService, ExercisePdfService, ExerciseStorageService],
})
export class ExercisesModule {}
