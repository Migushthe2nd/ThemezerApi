import {Field, ObjectType} from "@nestjs/graphql";
import {Target} from "../common/enums/Target";
import {ItemModelInterface} from "../common/interfaces/Item.model.interface";
import {PackModel} from "../Pack/Pack.model";
import {LayoutModel} from "../Layout/Layout.model";
import {ThemeAssetsModel} from "./ThemeAssets/ThemeAssets.model";
import {ThemePreviewsModel} from "./ThemePreviews/ThemePreviews.model";
import {ThemeTagModel} from "../ThemeTag/ThemeTag.model";


@ObjectType({implements: () => [ItemModelInterface]})
export class ThemeModel extends ItemModelInterface {

    @Field(() => PackModel)
    pack?: PackModel;

    @Field(() => Target)
    target: Target;

    @Field()
    isNSFW: boolean;

    @Field()
    layout?: LayoutModel;

    @Field(() => [ThemeTagModel])
    tags: ThemeTagModel[];

    @Field(() => ThemePreviewsModel)
    previews: ThemePreviewsModel;

    @Field(() => ThemeAssetsModel)
    assets: ThemeAssetsModel;

}