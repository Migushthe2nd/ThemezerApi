import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {FindConditions, In, Repository} from "typeorm";
import {executeAndPaginate, PaginationArgs} from "../common/args/Pagination.args";
import {SortOrder} from "../common/enums/SortOrder";
import {HBThemeEntity} from "./HBTheme.entity";
import {ItemSort} from "../common/args/ItemSortArgs";
import {toTsQuery} from "../common/TsQueryCreator";

@Injectable()
export class HBThemeService {

    constructor(@InjectRepository(HBThemeEntity) private repository: Repository<HBThemeEntity>) {
    }

    findOne({
                id,
                isNSFW,
                packId,
            }: { id?: string, isNSFW?: boolean, packId?: string }, relations: string[] = []): Promise<HBThemeEntity> {
        const findConditions: FindConditions<HBThemeEntity> = {};

        if (id != undefined) {
            findConditions.id = id;
        }
        if (isNSFW != undefined) {
            findConditions.isNSFW = isNSFW;
        }
        if (packId != undefined) {
            findConditions.packId = packId;
        }

        return this.repository.findOne({
            where: findConditions,
            relations,
        });
    }

    findAll(
        {
            packId,
            paginationArgs,
            sort = ItemSort.ADDED,
            order = SortOrder.DESC,
            query,
            creators,
            includeNSFW,
        }:
            {
                packId?: string,
                paginationArgs?: PaginationArgs,
                sort?: ItemSort,
                order?: SortOrder,
                query?: string,
                creators?: string[],
                includeNSFW?: boolean
            },
    ): Promise<[HBThemeEntity[], number]> {
        const findConditions: FindConditions<HBThemeEntity> = {};

        if (packId != undefined) {
            findConditions.packId = packId;
        }
        if (creators?.length > 0) {
            findConditions.creator = {
                id: In(creators),
            };
        }
        if (includeNSFW != true) {
            findConditions.isNSFW = false;
        }

        const queryBuilder = this.repository.createQueryBuilder("hbtheme")
            .where(findConditions)
            .leftJoinAndSelect("hbtheme.previews", "previews")
            .leftJoinAndSelect("hbtheme.assets", "assets")
            .leftJoinAndSelect("hbtheme.tags", "tags")
            .orderBy({["hbtheme." + sort]: order});

        if (query?.length > 0) {
            queryBuilder.andWhere(`to_tsquery(:query) @@ (
                setweight(to_tsvector('pg_catalog.english', coalesce(hbtheme.name, '')), 'A') ||
                setweight(to_tsvector('pg_catalog.english', coalesce(hbtheme.description, '')), 'C') ||
                to_tsvector('pg_catalog.english', coalesce(CASE WHEN hbtheme."isNSFW" THEN 'NSFW' END, '')) ||
                to_tsvector(tags.name)
            )`, {query: toTsQuery(query)});
        }

        return executeAndPaginate(paginationArgs, queryBuilder);
    }

    findRandom(
        {
            limit,
            includeNSFW,
        }:
            {
                limit?: number,
                includeNSFW?: boolean
            },
    ): Promise<HBThemeEntity[]> {
        const findConditions: FindConditions<HBThemeEntity> = {};

        if (includeNSFW != true) {
            findConditions.isNSFW = false;
        }

        const query = this.repository.createQueryBuilder()
            .where(findConditions)
            .orderBy("RANDOM()");

        if (limit) {
            query.limit(limit);
        }

        return query.getMany();
    }

}