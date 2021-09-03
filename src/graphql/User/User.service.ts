import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {FindConditions, Repository} from "typeorm";
import {UserEntity} from "./User.entity";
import {StringContains} from "../common/findOperators/StringContains";
import {executeAndPaginate, PaginationArgs} from "../common/args/Pagination.args";
import {SortOrder} from "../common/enums/SortOrder";
import {UserSort} from "./User.resolver";
import {EmailAlreadyRegisteredError} from "../../errors/auth/EmailAlreadyRegistered.error";
import {UnknownError} from "../../errors/Unknown.error";
import {UserConnectionsEntity} from "./UserConnections/UserConnections.entity";
import {UserPreferencesEntity} from "./UserPreferences/UserPreferences.entity";
import {UserProfileEntity} from "./UserProfile/UserProfile.entity";

@Injectable()
export class UserService {

    constructor(@InjectRepository(UserEntity) private userRepository: Repository<UserEntity>) {
    }

    findOne({id, email}: { id?: string, email?: string }, relations: string[] = []): Promise<UserEntity> {
        const findConditions: FindConditions<UserEntity> = {};

        if (id != undefined) {
            findConditions.id = id;
        }
        if (email != undefined) {
            findConditions.email = email;
        }

        return this.userRepository.findOne({
            where: findConditions,
            relations,
        });
    }

    findAll(
        {
            paginationArgs,
            sort = UserSort.USERNAME,
            order = SortOrder.ASC,
            query,
            isAdmin,
        }:
            {
                paginationArgs?: PaginationArgs
                sort?: UserSort,
                order?: SortOrder,
                query?: string
                isAdmin?: boolean
            },
    ): Promise<[UserEntity[], number]> {
        const findConditions: FindConditions<UserEntity> = {};

        if (query?.length > 0) {
            findConditions.username = StringContains(query);
        }
        if (isAdmin != undefined) {
            findConditions.isAdmin = isAdmin;
        }

        return executeAndPaginate(paginationArgs,
            this.repository.createQueryBuilder("user")
                .where(findConditions)
                .leftJoinAndSelect("user.profile", "profile")
                .leftJoinAndSelect("user.preferences", "preferences")
                .leftJoinAndSelect("user.connections", "connections")
                .orderBy({[sort]: order}),
        );
    }

    async create(email: string, password: string, username: string): Promise<UserEntity> {
        try {
            const user = UserEntity.create({email, password, username});
            user.connections = new UserConnectionsEntity();
            user.preferences = new UserPreferencesEntity();
            user.profile = new UserProfileEntity();
            return user.save();
        } catch (err) {
            if (err.message.includes("UQ")) {
                throw new EmailAlreadyRegisteredError();
            } else throw new UnknownError();
        }
    }

}