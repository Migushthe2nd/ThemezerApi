import {Entity, JoinColumn, OneToOne, PrimaryColumn} from "typeorm";
import {HBThemeEntity} from "../HBTheme.entity";
import {PreviewsEntityInterface} from "../../common/interfaces/Previews.entity.interface";
import {CDNMapper} from "../../common/CDNMapper";

@Entity()
export class HBThemePreviewsEntity extends PreviewsEntityInterface {

    @OneToOne(() => HBThemeEntity, hbthemeEntity => hbthemeEntity.previews, {onDelete: "CASCADE"})
    @JoinColumn({name: "hbthemeId"})
    hbtheme: HBThemeEntity;

    @PrimaryColumn({update: false})
    hbthemeId: string;

    get image720Url() {
        return CDNMapper.hbthemes.previews(this.hbthemeId, "720", "webp", this.image720Hash);
    }

    get image360Url() {
        return CDNMapper.hbthemes.previews(this.hbthemeId, "360", "webp", this.image360Hash);
    }

    get image240Url() {
        return CDNMapper.hbthemes.previews(this.hbthemeId, "240", "webp", this.image240Hash);
    }

    get image180Url() {
        return CDNMapper.hbthemes.previews(this.hbthemeId, "180", "webp", this.image180Hash);
    }

    get imagePlaceholderUrl() {
        return CDNMapper.hbthemes.previews(this.hbthemeId, "placeholder", "webp", this.imagePlaceholderHash);
    }

}