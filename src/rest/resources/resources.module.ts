import {Module} from "@nestjs/common";
import {ServeStaticModule} from "@nestjs/serve-static";
import {join} from "path";

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, "..", "..", "..", "resources"),
            serveRoot: "/cdn/resources",
        }),
    ],
})
export class ResourcesModule {
}
