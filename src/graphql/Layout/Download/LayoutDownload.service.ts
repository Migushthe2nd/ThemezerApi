import {Injectable} from "@nestjs/common";
import {FindConditions, Raw, Repository} from "typeorm";
import {InjectRepository} from "@nestjs/typeorm";
import {DownloadClientService} from "../../DownloadClient/DownloadClient.service";
import {LayoutDownloadEntity} from "./LayoutDownload.entity";

@Injectable()
export class LayoutDownloadService {

    constructor(@InjectRepository(LayoutDownloadEntity) private repository: Repository<LayoutDownloadEntity>, private downloadClientService: DownloadClientService) {
    }

    async increment(id: string, ip: string, userAgent: string, userId?: string) {
        const findConditions: FindConditions<LayoutDownloadEntity> = {};

        // Try to find an entry made within the last hour
        if (userId != undefined) {
            findConditions.user = {
                id: userId,
            };
        }
        findConditions.layoutId = id;
        findConditions.ip = ip;
        findConditions.timestamp = Raw((alias) => `${alias} > (NOW() - '1 hour'::INTERVAL)`);

        const entry = await this.repository.findOne({
            where: findConditions,
        });

        // If there was none, register as a new download
        if (!entry) {
            const entry = new LayoutDownloadEntity();
            entry.layoutId = id;
            entry.ip = ip;
            if (userId != undefined) {
                entry.userId = userId;
            }
            entry.downloadClient = await this.downloadClientService.findOrInsert(userAgent);

            await entry.save();
        }
    }

}