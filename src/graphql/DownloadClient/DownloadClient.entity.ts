import {BaseEntity, Column, Entity, PrimaryGeneratedColumn} from "typeorm";


@Entity()
export class DownloadClientEntity extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column({unique: true})
    userAgent: string;

}