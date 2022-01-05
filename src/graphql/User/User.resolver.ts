import {Args, Info, Mutation, Query, Resolver} from "@nestjs/graphql";
import {UserService} from "./User.service";
import {UserModel} from "./User.model";
import {PaginationArgs} from "../common/args/Pagination.args";
import {PaginatedUsers} from "./PaginatedUsers.model";
import {UserNotFoundError} from "../common/errors/auth/UserNotFound.error";
import {ListArgs} from "./dto/List.args";
import {SortArgs} from "./dto/Sort.args";
import {GraphQLResolveInfo} from "graphql";
import {Auth} from "../../common/decorators/Auth.decorator";
import {AuthService} from "../Auth/Auth.service";
import {PasswordIncorrectError} from "../common/errors/auth/PasswordIncorrect.error";
import {UpdateUserArgs} from "./dto/UpdateUser.args";
import {CurrentUser} from "../../common/decorators/CurrentUser.decorator";
import {UserEntity} from "./User.entity";
import {UpdateUserProfileArgs} from "./dto/UpdateUserPreferences.args";


@Resolver(UserModel)
export class UserResolver {

    constructor(private userService: UserService) {
    }

    @Query(() => UserModel, {
        description: `Find a single user`,
    })
    async user(
        @Info() info: GraphQLResolveInfo,
        @Args("id") id: string,
    ): Promise<UserModel> {
        const user = await this.userService.findOne({id}, {info});
        if (!user) {
            throw new UserNotFoundError();
        }
        return new UserModel(user);
    }

    @Query(() => PaginatedUsers, {
        description: `Find multiple users`,
    })
    async users(
        @Info() info: GraphQLResolveInfo,
        @Args() paginationArgs: PaginationArgs,
        @Args() sortArgs: SortArgs,
        @Args() listArgs?: ListArgs,
    ): Promise<PaginatedUsers> {
        const result = await this.userService.findAll({
            paginationArgs,
            ...sortArgs,
            ...listArgs,
        }, {info});

        return new PaginatedUsers(
            paginationArgs,
            result.count,
            result.result.map((u) => new UserModel(u)),
        );
    }

    @Mutation(() => Boolean, {
        description: "Delete a user. This will delete all of the user's data, including all of their submissions. All layouts will be transfered the 'unknown' user.",
    })
    @Auth({ownerOnly: true})
    async deleteUser(
        @Args("id") id: string,
        @Args("password") password: string,
    ): Promise<boolean> {
        const userToDelete = await this.userService.findOne({id});
        if (!await AuthService.validatePassword(password, userToDelete.password)) {
            throw new PasswordIncorrectError();
        }
        await this.userService.delete(id);
        return true;
    }

    @Mutation(() => Boolean, {
        description: "Update a user.",
    })
    @Auth({ownerOnly: true})
    async updateUser(@Args() {id, data}: UpdateUserArgs): Promise<boolean> {
        await this.userService.update(id, data);
        return true;
    }

    @Mutation(() => Boolean, {
        description: "Update a user.",
    })
    @Auth()
    async updateUserPreferences(@CurrentUser() {id}: UserEntity, @Args() data: UpdateUserProfileArgs): Promise<boolean> {
        await this.userService.updatePreferences(id, data);
        return true;
    }

    @Mutation(() => Boolean, {
        description: "Accept the Terms of Service.",
    })
    @Auth()
    async updateUserAcceptToS(@CurrentUser() {id}: UserEntity, @Args("accept") accept: boolean): Promise<boolean> {
        await this.userService.setHasAccepted(id, accept);
        return true;
    }

    @Mutation(() => Boolean, {
        description: "Block a user from submitting new items. Only accessible to the admins.",
    })
    @Auth({adminOnly: true})
    async updateUserBlockStatus(@Args("id") id: string, @Args("accept") accept: boolean): Promise<boolean> {
        await this.userService.setIsBlocked(id, accept);
        return true;
    }

    @Query(() => String, {
        description: "Fetch the currently authenticated user's CSRF token.",
    })
    @Auth()
    async getCSRFToken(@CurrentUser() {csrfToken}: UserEntity, @Args("accept") accept: boolean): Promise<string> {
        return csrfToken;
    }

}