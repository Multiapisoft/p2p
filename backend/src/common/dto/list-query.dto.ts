import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Shared list query — safe with forbidNonWhitelisted when used as the sole @Query() DTO. */
export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}

export type ListQueryOpts = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
};

export function normalizeListOpts(opts: ListQueryOpts = {}, defaultLimit = 10) {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit =
    opts.limit && opts.limit > 0 ? Math.min(Number(opts.limit), 100) : defaultLimit;
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    search: typeof opts.search === 'string' ? opts.search.trim() : '',
    status: opts.status && opts.status !== 'all' ? String(opts.status) : undefined,
    sort: (opts.sort as string) || 'newest',
  };
}

export function listSortMap(
  sort: string | undefined,
  map: Record<string, Record<string, 1 | -1>>,
): Record<string, 1 | -1> {
  return map[sort || 'newest'] || map.newest || { createdAt: -1 };
}
