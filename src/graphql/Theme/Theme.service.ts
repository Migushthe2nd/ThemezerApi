import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {EntityManager, FindConditions, getConnection, In, Repository} from "typeorm";
import {ThemeEntity} from "./Theme.entity";
import {executeAndPaginate, PaginationArgs} from "../common/args/Pagination.args";
import {Target} from "../common/enums/Target";
import {SortOrder} from "../common/enums/SortOrder";
import {ItemSort} from "../common/args/ItemSort.args";
import {toTsQuery} from "../common/TsQueryCreator";
import {IsOwner} from "../common/interfaces/IsOwner.interface";
import {exists} from "../common/functions/exists";
import {ThemeDataInput} from "./dto/ThemeData.input";
import {PackDataInput} from "./dto/PackData.input";
import {ThemeTagEntity} from "../ThemeTag/ThemeTag.entity";
import {ThemePreviewsEntity} from "./Previews/ThemePreviews.entity";
import {ThemeAssetsEntity} from "./Assets/ThemeAssets.entity";
import {InvalidThemeContentsError} from "../common/errors/InvalidThemeContents.error";
import {ThemeOptionEntity} from "./ThemeOptions/ThemeOption.entity";
import {LayoutOptionService} from "../LayoutOption/LayoutOption.service";
import {LayoutOptionType} from "../LayoutOption/common/LayoutOptionType.enum";
import {LayoutNotFoundError} from "../common/errors/LayoutNotFound.error";
import {ServiceFindOptionsParameter} from "../common/interfaces/ServiceFindOptions.parameter";
import {createInfoSelectQueryBuilder} from "../common/functions/createInfoSelectQueryBuilder";
import {ThemeHashEntity} from "../Cache/Theme/ThemeHash.entity";
import {GetHash} from "../common/interfaces/GetHash.interface";
import {PackEntity} from "../Pack/Pack.entity";
import {PackPreviewsEntity} from "../Pack/Previews/PackPreviews.entity";
import {WebhookService} from "../../webhook/Webhook.service";
import {UserEntity} from "../User/User.entity";
import {HBThemeEntity} from "../HBTheme/HBTheme.entity";
import {HBThemeDataInput} from "./dto/HBThemeData.input";
import {HBThemePreviewsEntity} from "../HBTheme/Previews/HBThemePreviews.entity";
import {HBThemeAssetsEntity} from "../HBTheme/Assets/HBThemeAssets.entity";
import {PackMinThemesError} from "../common/errors/submissions/PackMinThemes.error";
import {NoThemesError} from "../common/errors/submissions/NoThemes.error";
import {HBThemeLightColorSchemeEntity} from "../HBTheme/ColorScheme/HBThemeLightColorScheme.entity";
import {HBThemeDarkColorSchemeEntity} from "../HBTheme/ColorScheme/HBThemeDarkColorScheme.entity";
import {OtherError} from "../common/errors/Other.error";
import {MailService} from "../../mail/mail.service";
import {ThemeNotFoundError} from "../common/errors/ThemeNotFound.error";
import {addPrivateCondition} from "../common/functions/addPrivateCondition";
import {ItemVisibility} from "../common/enums/ItemVisibility";
import {PrivatableThemeDataInput} from "./dto/PrivatableThemeData.input";
import {PrivatableHbthemeDataInput} from "./dto/PrivatableHbthemeData.input";
import {UpdateThemeDataInput} from "./dto/UpdateThemeData.input";
import {deleteIfEmpty, recomputeNSFW, regeneratePreview} from "../Pack/Pack.constraints";
import {selectTags} from "../common/functions/selectTags";
import {readImageAsset} from "../common/functions/readImageAsset";
import {insertOrUpdateTags} from "../common/functions/insertOrUpdateTags";

@Injectable()
export class ThemeService implements IsOwner, GetHash {

    constructor(
        @InjectRepository(ThemeEntity) private repository: Repository<ThemeEntity>,
        @InjectRepository(ThemeHashEntity) private hashRepository: Repository<ThemeHashEntity>,
        private mailService: MailService,
        private layoutOptionService: LayoutOptionService,
        private webhookService: WebhookService,
    ) {
    }

    findOne({
                id,
                isNSFW,
                packId,
            }: {
                id?: string,
                isNSFW?: boolean,
                packId?: string
            },
            options?: ServiceFindOptionsParameter<ThemeEntity>,
    ): Promise<ThemeEntity> {
        let queryBuilder = createInfoSelectQueryBuilder(options, this.repository);
        const findConditions: FindConditions<ThemeEntity> = {};

        if (id != undefined) {
            findConditions.id = id;
        }
        if (isNSFW != undefined) {
            findConditions.isNSFW = isNSFW;
        }
        if (packId != undefined) {
            findConditions.packId = packId;
        }

        queryBuilder
            .where(findConditions);

        return queryBuilder.getOne();
    }

    findAll(
        {
            packId,
            paginationArgs,
            sort = ItemSort.ADDED,
            order = SortOrder.DESC,
            target,
            query,
            creators,
            layouts,
            includeNSFW,
            visibility = new ItemVisibility(),
            looseOnly,
        }:
            {
                packId?: string,
                paginationArgs?: PaginationArgs,
                sort?: ItemSort,
                order?: SortOrder,
                query?: string,
                target?: Target,
                creators?: string[],
                layouts?: string[],
                includeNSFW?: Boolean
                visibility?: ItemVisibility,
                looseOnly?: boolean
            },
        options?: ServiceFindOptionsParameter<ThemeEntity>,
    ) {
        const queryBuilder = this.repository.createQueryBuilder();
        const findConditions: FindConditions<ThemeEntity> = {};

        if (packId != undefined) {
            findConditions.packId = packId;
        }
        if (target != undefined) {
            findConditions.target = target;
        }
        if (creators?.length > 0) {
            findConditions.creator = {
                id: In(creators),
            };
        }
        if (layouts?.length > 0) {
            findConditions.layout = {
                id: In(layouts),
            };
        }
        if (includeNSFW != true) {
            findConditions.isNSFW = false;
        }
        if (looseOnly) {
            findConditions.packId = null;
        }

        queryBuilder
            .where(findConditions)
            .leftJoinAndSelect(queryBuilder.alias + ".tags", "tags")
            .orderBy({[`"${queryBuilder.alias}"."${sort}"`]: order});

        if (query?.length > 0) {
            queryBuilder.andWhere(`to_tsquery(:query) @@ (
                setweight(to_tsvector('pg_catalog.english', coalesce("${queryBuilder.alias}".name, '')), 'A') ||
                setweight(to_tsvector('pg_catalog.english', coalesce("${queryBuilder.alias}".description, '')), 'C') ||
                to_tsvector('pg_catalog.english', coalesce(CASE WHEN "${queryBuilder.alias}"."isNSFW" THEN 'NSFW' END, '')) ||
                to_tsvector(tags.name)
            )`, {query: toTsQuery(query)});
        }

        addPrivateCondition(queryBuilder, visibility);

        createInfoSelectQueryBuilder(options, this.repository, queryBuilder);

        return executeAndPaginate(queryBuilder, paginationArgs);
    }

    findRandom(
        {
            limit,
            target,
            includeNSFW,
        }:
            {
                limit?: number,
                target?: Target,
                includeNSFW?: boolean
            },
        options?: ServiceFindOptionsParameter<ThemeEntity>,
    ): Promise<ThemeEntity[]> {
        let queryBuilder = createInfoSelectQueryBuilder(options, this.repository);
        const findConditions: FindConditions<ThemeEntity> = {};

        if (target != undefined) {
            findConditions.target = target;
        }
        if (includeNSFW != true) {
            findConditions.isNSFW = false;
        }

        findConditions.isPrivate = false;

        queryBuilder
            .where(findConditions)
            .orderBy("RANDOM()");

        if (limit != undefined) {
            queryBuilder.limit(limit);
        }

        return queryBuilder.getMany();
    }

    async insertMultiple(
        creator: UserEntity,
        makePrivate: boolean,
        themeData: ThemeDataInput[] | PrivatableThemeDataInput[],
        hbthemeData: HBThemeDataInput[] | PrivatableHbthemeDataInput[],
        packData: PackDataInput,
    ) {
        if (packData && themeData.length + hbthemeData.length < 2) {
            throw new PackMinThemesError({amount: 2});
        } else if (themeData.length + hbthemeData.length == 0) {
            throw new NoThemesError();
        }
        try {
            let insertedPack: PackEntity = null;
            const insertedThemes: ThemeEntity[] = [];
            const insertedHbthemes: HBThemeEntity[] = [];
            const insertedTags: ThemeTagEntity[] = [];
            const insertedHbTags: ThemeTagEntity[] = [];
            await getConnection().manager.transaction(async entityManager => {
                // Pack --------------------------------------------------------------------
                if (packData) {
                    insertedPack = PackEntity.create({
                        creator: creator,
                        name: packData.name,
                        description: packData.description,
                        previews: new PackPreviewsEntity(),
                        isNSFW: themeData.some(theme => theme.isNSFW),
                        isPrivate: makePrivate,
                    });
                }

                // Themes ------------------------------------------------------------------
                for (const submittedTheme of themeData) {
                    const theme = ThemeEntity.create({
                        name: submittedTheme.name,
                        description: submittedTheme.description,
                        target: submittedTheme.target,
                        isNSFW: submittedTheme.isNSFW,
                        creator: creator,
                        layoutId: submittedTheme.layoutId || null,
                        // find the tag in the array
                        tags: selectTags(submittedTheme.tags, insertedTags),
                        previews: new ThemePreviewsEntity(),
                        assets: new ThemeAssetsEntity(),
                        isPrivate: (submittedTheme instanceof PrivatableThemeDataInput ? submittedTheme.makePrivate : makePrivate) || false,
                    });

                    // previews
                    await theme.previews.generateFromStream((await submittedTheme.screenshot).createReadStream);

                    // assets
                    if (!(submittedTheme.assets?.backgroundImage || submittedTheme.layoutId || submittedTheme.assets?.customLayoutJson || submittedTheme.assets?.customCommonLayoutJson)) {
                        // theme require at least either image or layout
                        throw new InvalidThemeContentsError({}, "themes require an image, a layout, or both");
                    }
                    if (!!submittedTheme.layoutId && !!(submittedTheme.assets?.customLayoutJson || submittedTheme.assets?.customCommonLayoutJson)) {
                        // can't have custom layout AND layoutId
                        throw new InvalidThemeContentsError(
                            {}, "layoutId cannot be combined with customLayoutJson or customCommonLayoutJson",
                        );
                    } else {
                        theme.assets.customLayoutJson = submittedTheme.assets?.customLayoutJson;
                        theme.assets.customCommonLayoutJson = submittedTheme.assets?.customCommonLayoutJson;
                    }

                    if (submittedTheme.assets?.homeIcon) {
                        theme.assets.homeIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "homeIcon",
                            ThemeAssetsEntity.HOME_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets?.albumIcon) {
                        theme.assets.albumIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "albumIcon",
                            ThemeAssetsEntity.ALBUM_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets?.newsIcon) {
                        theme.assets.newsIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "newsIcon",
                            ThemeAssetsEntity.NEWS_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets?.shopIcon) {
                        theme.assets.shopIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "shopIcon",
                            ThemeAssetsEntity.SHOP_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets?.controllerIcon) {
                        theme.assets.controllerIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "controllerIcon",
                            ThemeAssetsEntity.CONTROLLER_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets?.settingsIcon) {
                        theme.assets.settingsIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "settingsIcon",
                            ThemeAssetsEntity.SETTINGS_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets?.powerIcon) {
                        theme.assets.powerIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "powerIcon",
                            ThemeAssetsEntity.POWER_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets?.backgroundImage) {
                        await theme.assets.setImage((await submittedTheme.assets.backgroundImage).createReadStream);
                    }

                    // Options
                    if ((submittedTheme.assets?.customLayoutJson || submittedTheme.assets?.customCommonLayoutJson) && submittedTheme.options?.length > 0) {
                        // themes don't support options for custom layouts
                        throw new InvalidThemeContentsError({}, "cannot combine layout options with a custom layout");
                    }
                    theme.options = await this.getOptions(submittedTheme);

                    for (const tag of theme.tags) {
                        if (!insertedTags.map((t: ThemeTagEntity) => t.name).includes(tag.name)) {
                            insertedTags.push(tag);
                        }
                    }

                    insertedThemes.push(theme);
                }

                // HBThemes ------------------------------------------------------------------
                for (const submittedTheme of hbthemeData) {
                    const hbtheme = HBThemeEntity.create({
                        name: submittedTheme.name,
                        description: submittedTheme.description,
                        isNSFW: submittedTheme.isNSFW,
                        creator: creator,
                        tags: selectTags(submittedTheme.tags, insertedHbTags),
                        previews: new HBThemePreviewsEntity(),
                        assets: new HBThemeAssetsEntity(),
                        lightTheme: new HBThemeLightColorSchemeEntity(submittedTheme.lightTheme),
                        darkTheme: new HBThemeDarkColorSchemeEntity(submittedTheme.darkTheme),
                        isPrivate: (submittedTheme instanceof PrivatableThemeDataInput ? submittedTheme.makePrivate : makePrivate) || false,
                    });

                    // previews
                    await hbtheme.previews.generateFromStream((await submittedTheme.screenshot).createReadStream);

                    // assets
                    if (!Object.values(submittedTheme.assets).some((v) => !!v)) {
                        // theme require at least one asset
                        throw new InvalidThemeContentsError({}, "hbthemes require at least one asset");
                    }
                    hbtheme.assets.layout = submittedTheme.assets.layout;

                    if (submittedTheme.assets.icon) {
                        hbtheme.assets.iconFile = await readImageAsset(
                            submittedTheme.assets,
                            "icon",
                            HBThemeAssetsEntity.ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.batteryIcon) {
                        hbtheme.assets.batteryIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "batteryIcon",
                            HBThemeAssetsEntity.BATTERY_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.chargingIcon) {
                        hbtheme.assets.chargingIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "chargingIcon",
                            HBThemeAssetsEntity.CHARGING_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.folderIcon) {
                        hbtheme.assets.folderIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "folderIcon",
                            HBThemeAssetsEntity.FOLDER_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.invalidIcon) {
                        hbtheme.assets.invalidIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "invalidIcon",
                            HBThemeAssetsEntity.INVALID_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.themeIconDark) {
                        hbtheme.assets.themeIconDarkFile = await readImageAsset(
                            submittedTheme.assets,
                            "themeIconDark",
                            HBThemeAssetsEntity.THEME_ICON_DARK_FILE,
                        );
                    }
                    if (submittedTheme.assets.themeIconLight) {
                        hbtheme.assets.themeIconLightFile = await readImageAsset(
                            submittedTheme.assets,
                            "themeIconLight",
                            HBThemeAssetsEntity.THEME_ICON_LIGHT_FILE,
                        );
                    }
                    if (submittedTheme.assets.airplaneIcon) {
                        hbtheme.assets.airplaneIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "airplaneIcon",
                            HBThemeAssetsEntity.AIRPLANE_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.wifiNoneIcon) {
                        hbtheme.assets.wifiNoneIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "wifiNoneIcon",
                            HBThemeAssetsEntity.WIFI_NONE_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.wifi1Icon) {
                        hbtheme.assets.wifi1IconFile = await readImageAsset(
                            submittedTheme.assets,
                            "wifi1Icon",
                            HBThemeAssetsEntity.WIFI1_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.wifi2Icon) {
                        hbtheme.assets.wifi2IconFile = await readImageAsset(
                            submittedTheme.assets,
                            "wifi2Icon",
                            HBThemeAssetsEntity.WIFI2_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.wifi3Icon) {
                        hbtheme.assets.wifi3IconFile = await readImageAsset(
                            submittedTheme.assets,
                            "wifi3Icon",
                            HBThemeAssetsEntity.WIFI3_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.ethIcon) {
                        hbtheme.assets.ethIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "ethIcon",
                            HBThemeAssetsEntity.ETH_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.ethNoneIcon) {
                        hbtheme.assets.ethNoneIconFile = await readImageAsset(
                            submittedTheme.assets,
                            "ethNoneIcon",
                            HBThemeAssetsEntity.ETH_NONE_ICON_FILE,
                        );
                    }
                    if (submittedTheme.assets.backgroundImage !== undefined) {
                        await hbtheme.assets.setImage((await submittedTheme.assets.backgroundImage).createReadStream);
                    }

                    for (const tag of hbtheme.tags) {
                        if (!insertedHbTags.map((t: ThemeTagEntity) => t.name).includes(tag.name)) {
                            insertedHbTags.push(tag);
                        }
                    }

                    insertedHbthemes.push(hbtheme);
                }

                // Save all items ---------------------------------------------------------
                if (insertedPack) {
                    if (packData.preview) {
                        await insertedPack.previews.generateFromStream((await packData.preview).createReadStream);
                        insertedPack.previews.isCustom = true;
                    } else {
                        // generate collage (design 2)
                        await insertedPack.previews.generateCollage(insertedThemes, insertedHbthemes);
                    }
                    insertedPack = await insertedPack.save();
                    // set as pack on all themes
                    for (const theme of insertedThemes) {
                        theme.pack = insertedPack;
                    }
                    for (const hbtheme of insertedHbthemes) {
                        hbtheme.pack = insertedPack;
                    }
                }
                await insertOrUpdateTags(entityManager, insertedTags);
                await insertOrUpdateTags(entityManager, insertedHbTags);

                await entityManager.save(ThemeEntity, insertedThemes);
                await entityManager.save(HBThemeEntity, insertedHbthemes);
            });

            // send webhook message
            if (!makePrivate) {
                if (insertedPack) {
                    // pack submission
                    await this.webhookService.newPack(insertedPack, insertedThemes, insertedHbthemes);
                } else {
                    // theme submission
                    const nonPrivateThemes = insertedThemes.filter((theme: ThemeEntity) => !theme.isPrivate);
                    const nonPrivateHBThemes = insertedHbthemes.filter((theme: HBThemeEntity) => !theme.isPrivate);
                    if (nonPrivateThemes.length > 0 || nonPrivateHBThemes.length > 0) {
                        await this.webhookService.newThemes(nonPrivateThemes, nonPrivateHBThemes);
                    }
                }
            }
        } catch (e) {
            if ((e.detail as string)?.includes("layoutId")) {
                throw new LayoutNotFoundError({}, "Referenced layout does not exist");
            } else throw e;
        }
    }

    async isOwner(id: string, userId: string): Promise<boolean> {
        return !!(await exists(
            this.repository.createQueryBuilder()
                .where({id, creatorId: userId}),
        ));
    }

    async getHash(id: string): Promise<string> {
        const hashEntity = await this.hashRepository.createQueryBuilder()
            .where({id})
            .getOne();
        return hashEntity?.hashString;
    }

    async delete({ids, packIds}: { ids?: string[], packIds?: string[] } = {}) {
        const findConditions: FindConditions<ThemeEntity> = {};

        if (ids) {
            findConditions.id = In(ids);
        }
        if (packIds) {
            findConditions.packId = In(packIds);
        }

        await this.repository.manager.transaction(async entityManager => {
            const usedPackIds = (await entityManager.find(ThemeEntity, findConditions)).map(theme => theme.packId);
            const usedPackIdsSet = new Set(usedPackIds);

            await entityManager.delete(ThemeEntity, findConditions);
            for (const packId of usedPackIdsSet || []) {
                // if there are less than 2 items left in the pack, delete the pack
                const isDeleted = await deleteIfEmpty(entityManager, packId);
                if (!isDeleted) {
                    await regeneratePreview(entityManager, packId);
                }
            }
        });
    }

    async setVisibility({
                            id,
                            packId,
                            entityManager,
                        }: { id?: string, packId?: string, entityManager?: EntityManager }, makePrivate: boolean, reason: string) {
        if (packId) {
            // this is called from PackService, so force set the visibility and don't send any emails or whatever
            await entityManager.update(HBThemeEntity, {packId}, {
                isPrivate: makePrivate,
                updatedTimestamp: () => "\"updatedTimestamp\"",
            });
        } else {
            await this.repository.manager.transaction(async entityManager => {
                const theme = await this.repository.findOne({
                    where: {id},
                    relations: ["creator", "previews"],
                });

                if (!theme) {
                    throw new ThemeNotFoundError();
                }
                if (theme.packId) {
                    throw new OtherError("Cannot set visibility of a theme that is part of a pack");
                }

                theme.isPrivate = makePrivate;
                await entityManager.save(ThemeEntity, theme);
                await regeneratePreview(entityManager, packId);
                try {
                    if (reason) {
                        await this.mailService.sendThemePrivatedByAdmin(theme, reason);
                    }
                } catch (e) {
                    console.error(e);
                }
            });
        }
    }

    async update(id: string, data: UpdateThemeDataInput) {
        const theme = await this.repository.findOne({
            where: {id},
            relations: ["creator", "previews", "assets", "tags"],
        });
        await getConnection().manager.transaction(async entityManager => {
            if (!theme) {
                throw new ThemeNotFoundError();
            }
            if (data.name !== undefined) {
                theme.name = data.name;
            }
            if (data.description !== undefined) {
                theme.description = data.description;
            }
            if (data.isNSFW !== undefined) {
                theme.isNSFW = data.isNSFW;
            }
            const insertedTags: ThemeTagEntity[] = theme.tags;
            if (data.tags === null || data.tags === []) {
                theme.tags = [];
            } else if (data.tags !== undefined) {
                theme.tags = selectTags(data.tags, insertedTags);

                for (const tag of theme.tags) {
                    if (!insertedTags.map((t: ThemeTagEntity) => t.name).includes(tag.name)) {
                        insertedTags.push(tag);
                    }
                }
            }

            if (data.screenshot !== undefined) {
                await theme.previews.generateFromStream((await data.screenshot).createReadStream);
            }
            if (data.assets) {
                if (!theme.layoutId) {
                    if (data.assets.customLayoutJson !== undefined) {
                        theme.assets.customLayoutJson = data.assets.customLayoutJson;
                    }
                    if (data.assets.customCommonLayoutJson !== undefined) {
                        theme.assets.customCommonLayoutJson = data.assets.customCommonLayoutJson;
                    }
                }

                if (data.assets.homeIcon === null) {
                    theme.assets.homeIconFile = null;
                } else if (data.assets.homeIcon !== undefined) {
                    theme.assets.homeIconFile = await readImageAsset(
                        data.assets,
                        "homeIcon",
                        ThemeAssetsEntity.HOME_ICON_FILE,
                    );
                }
                if (data.assets.albumIcon === null) {
                    theme.assets.albumIconFile = null;
                } else if (data.assets.albumIcon !== undefined) {
                    theme.assets.albumIconFile = await readImageAsset(
                        data.assets,
                        "albumIcon",
                        ThemeAssetsEntity.ALBUM_ICON_FILE,
                    );
                }
                if (data.assets.newsIcon === null) {
                    theme.assets.newsIconFile = null;
                } else if (data.assets.newsIcon !== undefined) {
                    theme.assets.newsIconFile = await readImageAsset(
                        data.assets,
                        "newsIcon",
                        ThemeAssetsEntity.NEWS_ICON_FILE,
                    );
                }
                if (data.assets.shopIcon === null) {
                    theme.assets.shopIconFile = null;
                } else if (data.assets.shopIcon !== undefined) {
                    theme.assets.shopIconFile = await readImageAsset(
                        data.assets,
                        "shopIcon",
                        ThemeAssetsEntity.SHOP_ICON_FILE,
                    );
                }
                if (data.assets.controllerIcon === null) {
                    theme.assets.controllerIconFile = null;
                } else if (data.assets.controllerIcon !== undefined) {
                    theme.assets.controllerIconFile = await readImageAsset(
                        data.assets,
                        "controllerIcon",
                        ThemeAssetsEntity.CONTROLLER_ICON_FILE,
                    );
                }
                if (data.assets.settingsIcon === null) {
                    theme.assets.settingsIconFile = null;
                } else if (data.assets.settingsIcon !== undefined) {
                    theme.assets.settingsIconFile = await readImageAsset(
                        data.assets,
                        "settingsIcon",
                        ThemeAssetsEntity.SETTINGS_ICON_FILE,
                    );
                }
                if (data.assets.powerIcon === null) {
                    theme.assets.powerIconFile = null;
                } else if (data.assets.powerIcon !== undefined) {
                    theme.assets.powerIconFile = await readImageAsset(
                        data.assets,
                        "powerIcon",
                        ThemeAssetsEntity.POWER_ICON_FILE,
                    );
                }

                if (data.assets.backgroundImage !== undefined) {
                    await theme.assets.setImage((await data.assets.backgroundImage).createReadStream);
                }
            }
            if ((data.assets?.customLayoutJson || data.assets?.customCommonLayoutJson) && data.options?.length > 0) {
                // themes don't support options for custom layouts
                throw new InvalidThemeContentsError({}, "cannot combine layout options with a custom layout");
            }
            if (data.options === null) {
                theme.options = null;
            } else if (data.options !== undefined) {
                theme.options = await this.getOptions(data);
            }

            await insertOrUpdateTags(entityManager, insertedTags);
            await entityManager.save(ThemeEntity, theme);
            if (theme.packId) {
                if (data.isNSFW !== undefined) {
                    await recomputeNSFW(entityManager, {packId: theme.packId});
                }
                if (
                    data.screenshot !== undefined ||
                    (data.assets && data.assets.backgroundImage !== undefined)
                ) {
                    await regeneratePreview(entityManager, theme.packId);
                }
            }
        });
    }

    private getOptions(data: ThemeDataInput | UpdateThemeDataInput) {
        return Promise.all(data.options.map(async (o) => {
            const option = new ThemeOptionEntity();
            option.layoutOptionValueUUID = o.uuid;
            // determine which type the layoutOption expects, verify
            const layoutOption = await this.layoutOptionService.findOption({valueUuid: o.uuid});
            const type = layoutOption.type;
            if (type === LayoutOptionType.INTEGER) {
                if (!o.integerValue) throw new InvalidThemeContentsError({},
                    `missing option integerValue for ${o.uuid}`);
                option.variable = o.integerValue.toString();
            } else if (type === LayoutOptionType.DECIMAL) {
                if (!o.decimalValue) throw new InvalidThemeContentsError({},
                    `missing option decimalValue for ${o.uuid}`);
                option.variable = o.decimalValue.toPrecision(8).toString();
            } else if (type === LayoutOptionType.STRING) {
                if (!o.stringValue) throw new InvalidThemeContentsError({},
                    `missing option stringValue for ${o.uuid}`);
                option.variable = o.stringValue;
            } else if (type === LayoutOptionType.COLOR) {
                if (!o.colorValue) throw new InvalidThemeContentsError({},
                    `missing option colorValue for ${o.uuid}`);
                option.variable = o.colorValue;
            }

            return option;
        }));
    }

}