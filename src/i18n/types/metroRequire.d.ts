declare let module: NodeModule;

declare namespace __MetroModuleApi {
  interface RequireContext {
    keys(): string[];
    (id: string): unknown;
    <T>(id: string): T;
    resolve(id: string): string;
    id: string;
  }

  interface RequireFunction {
    (path: string): unknown;
    <T>(path: string): T;
    context(
      path: string,
      recursive?: boolean,
      filter?: RegExp,
      mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once',
    ): RequireContext;
  }
}

declare namespace NodeJS {
  type Require = __MetroModuleApi.RequireFunction;
}
declare let process: NodeJS.Process;
