import { IsIn, IsOptional } from 'class-validator';
export class MastodonSettingsDto {
  @IsOptional()
  @IsIn(['public', 'unlisted', 'private', 'direct'])
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
}
