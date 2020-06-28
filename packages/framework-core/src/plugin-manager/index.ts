import os from "os";
import path from "path";
import fs from "fs";

import { install } from "pkg-install";

import { emoji } from "../utils/emoji";
import { Config } from "../types";
import Context from "../context";
import Plugin from "../plugin";
import PluginServiceApi from "../plugin-sevice-api";

interface PluginData {
  id: string;
  name: string;
  inputs: any;
  pluginInstance?: Plugin;
  api?: PluginServiceApi;
}

interface PluginHookOption {
  id?: string | undefined;
  params?: any;
  icon?: string;
}

type PluginHookName = "init" | "build" | "deploy" | "compile";

/**
 * 插件管理器
 *
 * @description 管理插件的生命周期，为插件注入 api 和参数
 */
export default class PluginManager {
  context: Context;
  plugins: PluginData[];
  pluginRegisty: string;
  pluginInstallPromise: Promise<boolean>;
  pluginInstallState: boolean = false;

  constructor(context: Context) {
    this.context = context;
    this.plugins = this.resolvePlugins(this.context.appConfig);

    this.pluginRegisty = path.join(
      os.homedir(),
      ".cloudbase-framework/registry"
    );
    this.initRegistry();
    this.pluginInstallPromise = this.installPlugins();
  }

  /**
   * 初始化检测
   *
   * @param id
   */
  async init(id?: string) {
    return this.callPluginHook("init", {
      id,
    });
  }

  /**
   * 构建
   *
   * @param id
   */
  async build(id?: string) {
    return this.callPluginHook("build", {
      id,
      icon: emoji("🔨"),
    });
  }

  /**
   * 部署
   *
   * @param id
   */
  async compile(id?: string) {
    return this.callPluginHook("compile", {
      id,
      icon: emoji("🧬"),
    });
  }

  /**
   * 部署
   *
   * @param id
   */
  async deploy(id?: string) {
    return this.callPluginHook("deploy", {
      id,
      icon: emoji("🚀"),
    });
  }

  /**
   * 调用插件钩子
   * @param id
   */
  private callPluginHook(
    hook: PluginHookName,
    { id, params, icon }: PluginHookOption
  ) {
    return Promise.all(
      this.pickPlugins(id).map(async (pluginData) => {
        const pluginInstance = await this.loadPlugin(pluginData);

        if (typeof pluginInstance[hook] !== "function") {
          return;
        }

        this.context.logger.info(
          `${icon || emoji("🔧")} ${hook}: ${pluginData.id}...`
        );

        return (pluginInstance[hook] as any)(params);
      })
    );
  }

  /**
   * 解析插件
   * @param config
   */
  private resolvePlugins(config: Config) {
    const allPlugins = Object.entries(config.plugins).map(
      ([id, pluginConfig]) => {
        const { use, inputs } = pluginConfig;
        return {
          id,
          name: use,
          inputs: inputs,
        };
      }
    );
    return allPlugins;
  }

  /**
   * 加载插件代码
   *
   * @param pluginData
   */
  private async loadPlugin(pluginData: PluginData): Promise<Plugin> {
    if (pluginData.pluginInstance) {
      return pluginData.pluginInstance;
    }

    let PluginCode: Plugin | undefined;

    try {
      await this.pluginInstallPromise;
    } catch (e) {
      this.context.logger.error(e);
      throw new Error(
        `CloudBase Framwork: can't install plugin npm package '${pluginData.name}'`
      );
    }

    try {
      PluginCode = require(path.join(
        this.pluginRegisty,
        "node_modules",
        pluginData.name
      )).plugin;
    } catch (e) {
      this.context.logger.error(e);
      throw new Error(
        `CloudBase Framwork: can't find plugin '${pluginData.name}'`
      );
    }

    if (!PluginCode) {
      this.context.logger.error(
        `CloudBase Framwork: plugin '${pluginData.name}' isn't a valid plugin`
      );
      throw new Error(
        `CloudBase Framwork: plugin '${pluginData.name}' isn't a valid plugin`
      );
    }

    pluginData.pluginInstance = new (PluginCode as any)(
      pluginData.name,
      new PluginServiceApi(this),
      pluginData.inputs
    );
    return pluginData.pluginInstance as Plugin;
  }

  /**
   * 筛选插件
   * @param id
   */
  private pickPlugins(id?: string): PluginData[] {
    return id
      ? this.plugins.filter((plugin) => plugin.id === id)
      : this.plugins;
  }

  /**
   * @param packageName
   */
  private async installPackage(packageInfo: Record<string, string>) {
    this.context.logger.info(`${emoji("📦")} install plugins`);
    await install(
      {
        ...packageInfo,
        "pkg-install": "latest",
      },
      {
        prefer: "npm",
        cwd: this.pluginRegisty,
      }
    );
  }

  /**
   * 初始化插件仓库
   */
  initRegistry() {
    if (!fs.existsSync(this.pluginRegisty)) {
      fs.mkdirSync(this.pluginRegisty, { recursive: true });
    }
    const packageJSON = path.join(this.pluginRegisty, "package.json");
    if (!fs.existsSync(packageJSON)) {
      fs.writeFileSync(
        packageJSON,
        JSON.stringify({
          name: "cloudbase-framework-registry",
        })
      );
    }
  }

  async installPlugins() {
    if (this.pluginInstallState || process.env.CLOUDBASE_FX_ENV === "dev") {
      return true;
    } else {
      const packageInfo = this.plugins.reduce((prev, curr) => {
        (prev as any)[curr.name] = "latest";
        return prev;
      }, {});
      await this.installPackage(packageInfo);
      return true;
    }
  }
}
