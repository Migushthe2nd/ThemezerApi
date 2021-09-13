import {Args, ArgsType, Field, Parent, Query, ResolveField, Resolver} from "@nestjs/graphql";
import {PackService} from "./Pack.service";
import {LimitArg, PaginationArgs} from "../common/args/Pagination.args";
import {UserService} from "../User/User.service";
import {UserModel} from "../User/User.model";
import {ItemSortArgs} from "../common/args/ItemSortArgs";
import {PackModel} from "./Pack.model";
import {PackEntity} from "./Pack.entity";
import {PaginatedPacks} from "./PaginatedPacks.model";


@ArgsType()
class ListArgs {

    @Field({nullable: true})
    query?: string;
    @Field(() => [String], {nullable: true})
    creators?: string[];
    @Field({defaultValue: false, description: "Whether to include NSFW results. If false, a pack will be excluded if any of the themes is NSFW."})
    includeNSFW?: boolean = false;

}

@Resolver(PackModel)
export class PackResolver {

    constructor(
        private packService: PackService,
        private userService: UserService,
    ) {
    }

    @ResolveField(() => UserModel)
    creator(@Parent() pack: PackEntity): Promise<UserModel> {
        const id = pack.creatorId;
        return this.userService.findOne({id});
    }

    @ResolveField()
    isNSFW(@Parent() pack: PackEntity): Promise<boolean> {
        return this.packService.isNSFW(pack.id);
    }

    @Query(() => PackModel, {
        description: `Find a single pack`,
    })
    pack(
        @Args("id") id: string,
    ): Promise<PackModel> {
        return this.packService.findOne({id});
    }

    @Query(() => PaginatedPacks, {
        description: `Find multiple packs`,
    })
    async packs(
        @Args() paginationArgs: PaginationArgs,
        @Args() itemSortArgs: ItemSortArgs,
        @Args() listArgs?: ListArgs,
    ): Promise<PaginatedPacks> {
        const result = await this.packService.findAll({
            paginationArgs,
            ...itemSortArgs,
            ...listArgs,
        });

        return new PaginatedPacks(paginationArgs, result[1], result[0]);
    }

    @Query(() => [PackModel], {
        description: `Fetch random packs`,
    })
    randomPacks(
        @Args() limitArg?: LimitArg,
        @Args("includeNSFW", {defaultValue: false}) includeNSFW: boolean = false,
    ): Promise<PackModel[]> {
        return this.packService.findRandom({
            ...limitArg,
            includeNSFW,
        });
    }

}