import * as vscode from 'vscode';
import { EC2, waitUntilInstanceRunning, waitUntilInstanceStopped } from "@aws-sdk/client-ec2";

class EC2Instance extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly status: string,
    public readonly address: string,
    public readonly instanceId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
    this.description = status;
    this.iconPath = new vscode.ThemeIcon('device-desktop');
    this.contextValue = 'instance';
  }
}

class NoEC2Instances extends EC2Instance {
  constructor() {
    super('No instances found', '', '', '', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('alert');
    this.contextValue = 'no-instances';
  }
}

class FailedRequest extends EC2Instance {
  constructor(error: string) {
    super('Failed to retrieve instances', '', '', '', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('alert');
    this.contextValue = 'failed-request';
    this.tooltip = error;
  }
}

class Account {
  awsAccessKeyId: string = '';
  awsSecretAccessKey: string = '';
  region: string = '';
}

export enum Command {
  start = 'start',
  stop = 'stop',
}

const defaultUsername = 'ubuntu';
const availableRegions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ap-south-1', 'ap-northeast-2', 'ap-southeast-1',
  'ap-southeast-2', 'ap-northeast-1', 'ca-central-1', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3',
  'eu-north-1', 'sa-east-1'];

function hideKey(str: string): string {
  const shownChars = 4;
  if (str.length <= shownChars) {
    return str;
  }

  const lastFourChars = str.substring(str.length - shownChars);
  const asterisks = '*'.repeat(str.length - shownChars);
  return asterisks + lastFourChars;
}

export class EC2InstanceListViewProvider implements vscode.TreeDataProvider<EC2Instance> {
  context: vscode.ExtensionContext;

  private _onDidChangeTreeData: vscode.EventEmitter<EC2Instance | undefined> = new vscode.EventEmitter<EC2Instance | undefined>();
  readonly onDidChangeTreeData: vscode.Event<EC2Instance | undefined> = this._onDidChangeTreeData.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async inputAccount(accountConfigured: Account | undefined): Promise<Account | undefined> {
    const account = new Account();

    let awsAccessKeyId = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      prompt: 'AWS Access Key ID',
      placeHolder: accountConfigured ? hideKey(accountConfigured.awsAccessKeyId) : 'AWS Access Key ID',
      password: true,
    });
    awsAccessKeyId = awsAccessKeyId || accountConfigured?.awsAccessKeyId;
    if (!awsAccessKeyId) {
      return;
    }
    account.awsAccessKeyId = awsAccessKeyId;

    let awsSecretAccessKey = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      prompt: 'AWS Secret Access Key',
      placeHolder: accountConfigured ? hideKey(accountConfigured.awsSecretAccessKey) : 'AWS Secret Access Key',
      password: true,
    });
    awsSecretAccessKey = awsSecretAccessKey || accountConfigured?.awsSecretAccessKey;
    if (!awsSecretAccessKey) {
      return;
    }
    account.awsSecretAccessKey = awsSecretAccessKey;

    let region = await vscode.window.showQuickPick(availableRegions, {
      title: 'Region',
      canPickMany: false,
      ignoreFocusOut: true,
      placeHolder: accountConfigured?.region || 'Region',
    });
    region = region || accountConfigured?.region;
    if (!region) {
      return;
    }
    account.region = region;

    return account;
  }

  configureAccount(): void {
    const accountConfigured: Account | undefined = this.context.globalState.get('account');

    this.inputAccount(accountConfigured).then(account => {
      if (account) {
        this.context.globalState.update('account', account);
        this.refresh();
      }
    });
  }

  describeAccount(): void {
    const account: Account | undefined = this.context.globalState.get('account');

    if (account) {
      vscode.window.showInformationMessage(
        `AWS Access Key ID: ${account.awsAccessKeyId}\n
         Region: ${account.region}`
      );
    } else {
      vscode.window.showErrorMessage('Account is not configured');
    }
  }

  updateInstance(instance: EC2Instance, cmd: Command): void {
    const account: Account | undefined = this.context.globalState.get('account');

    if (!account) {
      vscode.window.showErrorMessage('Account is not configured');
      return;
    }

    switch (cmd) {
      case Command.start:
        if (instance.status !== 'stopped') {
          vscode.window.showErrorMessage('Instance cannot be started unless it is stopped');
        } else {
          this.startEC2Instance(account, instance.instanceId).then(() => {
            this.refresh();
            vscode.window.showInformationMessage(`Instance ${instance.instanceId} started`);
          });
        }
        break;
      case Command.stop:
        if (instance.status !== 'running') {
          vscode.window.showErrorMessage('Instance cannot be stopped unless it is running');
        } else {
          this.stopEC2Instance(account, instance.instanceId).then(() => {
            this.refresh();
            vscode.window.showInformationMessage(`Instance ${instance.instanceId} stopped`);
          });
        }
        break;
    }
  }

  attachInstance(instance: EC2Instance): void {
    if (instance.status !== 'running') {
      vscode.window.showErrorMessage('Instance is not running');
      return;
    }

    vscode.window.showInputBox({
      prompt: 'Username',
      ignoreFocusOut: true,
      value: defaultUsername,
      placeHolder: defaultUsername,
    }).then((username) => {
      if (!username) {
        vscode.window.showErrorMessage('Username is required');
        return;
      }

      if (!instance.address) {
        vscode.window.showErrorMessage('Instance does not have a public IP address');
        return;
      }

      vscode.commands.executeCommand('opensshremotes.openEmptyWindow', {
        host: `${username}@${instance.address}`,
      });
    });
  }

  cleanupAccount(): void {
    this.context.globalState.update('account', undefined);
    this.refresh();
  }

  async startEC2Instance(account: Account, instanceId: string): Promise<void> {
    var ec2 = new EC2({
      credentials: {
        accessKeyId: account.awsAccessKeyId,
        secretAccessKey: account.awsSecretAccessKey,
      },
      region: account.region,
    });

    try {
      await ec2.startInstances({
        InstanceIds: [instanceId],
      });
      vscode.window.showInformationMessage('Starting instance...');

      await new Promise(resolve => setTimeout(resolve, 1000));
      this.refresh();

      // Temporarily disable waiting
      // await waitUntilInstanceRunning({
      //   client: ec2,
      //   maxWaitTime: 60,
      // }, {
      //   InstanceIds: [instanceId],
      // });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start instance: ${error} `);
    }
  }

  async stopEC2Instance(account: Account, instanceId: string): Promise<void> {
    var ec2 = new EC2({
      credentials: {
        accessKeyId: account.awsAccessKeyId,
        secretAccessKey: account.awsSecretAccessKey,
      },
      region: account.region,
    });

    try {
      await ec2.stopInstances({
        InstanceIds: [instanceId],
      });

      vscode.window.showInformationMessage('Stopping instance...');

      await new Promise(resolve => setTimeout(resolve, 1000));
      this.refresh();

      // Temporarily disable waiting
      // await waitUntilInstanceStopped({
      //   client: ec2,
      //   maxWaitTime: -1,
      // }, {
      //   InstanceIds: [instanceId],
      // });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to stop instance: ${error} `);
    }
  }

  async getEC2Instances(account: Account): Promise<EC2Instance[]> {
    var ec2 = new EC2({
      credentials: {
        accessKeyId: account.awsAccessKeyId,
        secretAccessKey: account.awsSecretAccessKey,
      },
      region: account.region,
    });

    try {
      const result = await ec2.describeInstances({});

      // Filter out terminated instances
      var instances = result.Reservations?.flatMap(reservation => reservation.Instances || [])
        .filter(instance => instance.State?.Name !== 'terminated');

      // Filter based on configuration
      const filter: string | undefined = vscode.workspace.getConfiguration('ec2-farm').get('instance-name-filter');
      if (instances && filter && filter !== '') {
        instances = instances.filter(instance => {
          const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
          return RegExp(filter).test(nameTag?.Value || '');
        });
      }

      // Can not find any instances
      if (!instances || instances.length === 0) {
        return [new NoEC2Instances()];
      }

      return instances?.map(instance => {
        const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
        return new EC2Instance(
          nameTag?.Value || instance.InstanceId || '',
          instance.State?.Name || '',
          instance.PublicIpAddress || '',
          instance.InstanceId || '',
          vscode.TreeItemCollapsibleState.None
        );
      });
    } catch (error) {
      if (error instanceof Error) {
        return [new FailedRequest(error.message)];
      }
      return [new FailedRequest('Unknown error')];
    }
  }

  getTreeItem(element: EC2Instance): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EC2Instance): Thenable<EC2Instance[]> {
    const account: Account | undefined = this.context.globalState.get('account');
    if (!account) {
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve([]);
    } else {
      return this.getEC2Instances(account);
    }
  }
}
