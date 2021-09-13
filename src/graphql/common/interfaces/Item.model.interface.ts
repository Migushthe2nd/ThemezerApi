import {Field, ID, Int, InterfaceType} from "@nestjs/graphql";
import {UserModel} from "../../User/User.model";
import {URLResolver} from "graphql-scalars";


@InterfaceType("ItemInterface")
export abstract class ItemModelInterface {

    @Field(() => ID)
    id: string;

    @Field()
    creator: UserModel;

    @Field()
    name: string;

    @Field({nullable: true})
    description?: string;

    @Field()
    addedTimestamp: Date;

    @Field()
    updatedTimestamp: Date;

    @Field(() => Int)
    dlCount: number;

    @Field(() => URLResolver)
    downloadUrl: string;

}