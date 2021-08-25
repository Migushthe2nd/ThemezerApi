import {Field, ObjectType} from "@nestjs/graphql";
import {DiscordConnectionModel} from "./DiscordConnection.model";

@ObjectType()
export class UserConnectionsModel {

    @Field(() => DiscordConnectionModel)
    discord?: DiscordConnectionModel;

}

