import * as vscode from 'vscode';
import { EC2 } from "aws-sdk";

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

async function startEC2Instance(account: Account, instanceId: string): Promise<void> {
  var ec2 = new EC2({
    accessKeyId: account.awsAccessKeyId,
    secretAccessKey: account.awsSecretAccessKey,
    region: account.region,
  });

  try {
    await ec2.startInstances({
      InstanceIds: [instanceId],
    }).promise();
    vscode.window.showInformationMessage(`Started instance: ${instanceId}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start instance: ${error}`);
    console.log(error);
  }
}

async function stopEC2Instance(account: Account, instanceId: string): Promise<void> {
  var ec2 = new EC2({
    accessKeyId: account.awsAccessKeyId,
    secretAccessKey: account.awsSecretAccessKey,
    region: account.region,
  });

  try {
    await ec2.stopInstances({
      InstanceIds: [instanceId],
    }).promise();
    vscode.window.showInformationMessage(`Instance ${instanceId} stopped`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to stop instance: ${error}`);
    console.log(error);
  }
}

async function getEC2Instances(account: Account): Promise<EC2Instance[]> {
  var ec2 = new EC2({
    accessKeyId: account.awsAccessKeyId,
    secretAccessKey: account.awsSecretAccessKey,
    region: account.region,
  });

  try {
    const result = await ec2.describeInstances().promise();

    // Filter out terminated instances
    const instances = result.Reservations?.flatMap(reservation => reservation.Instances || [])
      .filter(instance => instance.State?.Name !== 'terminated');

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
    console.log(error);
    return [];
  }
}

function encryptKey(str: string): string {
  const lastFourChars = str.substring(str.length - 4);
  const asterisks = '*'.repeat(str.length - 4);
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

  configureAccount(): void {
    const account = new Account();
    const accountConfigured: Account | undefined = this.context.globalState.get('account');

    vscode.window.showInputBox({
      ignoreFocusOut: true,
      prompt: 'AWS Access Key ID',
      placeHolder: accountConfigured?.awsAccessKeyId || 'AWS Access Key ID',
    }).then((awsAccessKeyId) => {
      awsAccessKeyId = awsAccessKeyId || accountConfigured?.awsAccessKeyId;
      if (!awsAccessKeyId) {
        return;
      }

      account.awsAccessKeyId = awsAccessKeyId;

      vscode.window.showInputBox({
        ignoreFocusOut: true,
        prompt: 'AWS Secret Access Key',
        placeHolder: accountConfigured ? encryptKey(accountConfigured.awsSecretAccessKey) : 'AWS Secret Access Key',
      }).then((awsSecretAccessKey) => {
        awsSecretAccessKey = awsSecretAccessKey || accountConfigured?.awsSecretAccessKey;
        if (!awsSecretAccessKey) {
          return;
        }

        account.awsSecretAccessKey = awsSecretAccessKey;

        vscode.window.showInputBox({
          ignoreFocusOut: true,
          prompt: 'Region',
          placeHolder: accountConfigured?.region || 'Region',
        }).then((region) => {
          region = region || accountConfigured?.region;
          if (!region) {
            return;
          }

          account.region = region;

          this.context.globalState.update('account', account);
          this.describeAccount();
          this.refresh();
        });
      });
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
          vscode.window.showErrorMessage('Instance cannot be started');
        } else {
          startEC2Instance(account, instance.instanceId);
        }
        break;
      case Command.stop:
        if (instance.status !== 'running') {
          vscode.window.showErrorMessage('Instance cannot be stopped');
        } else {
          stopEC2Instance(account, instance.instanceId);
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

      vscode.commands.executeCommand('opensshremotes.openEmptyWindow', {
        host: `${username}@${instance.address}`,
      });
    });
  }

  cleanupAccount(): void {
    this.context.globalState.update('account', undefined);
    this.refresh();
  }

  getTreeItem(element: EC2Instance): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EC2Instance): Thenable<EC2Instance[]> {
    const account: Account | undefined = this.context.globalState.get('account');

    if (!account) {
      vscode.window.showErrorMessage('Account is not configured');
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve([]);
    } else {
      return getEC2Instances(account);
    }
  }
}
