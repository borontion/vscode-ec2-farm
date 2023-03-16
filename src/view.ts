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

class Account {
  awsAccessKeyId: string | undefined;
  awsSecretAccessKey: string | undefined;
  region: string | undefined;
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

    return instances?.map(instance => {
      const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
      console.log(instance);
      return new EC2Instance(
        nameTag?.Value || instance.InstanceId || '',
        instance.State?.Name || '',
        instance.PublicIpAddress || '',
        instance.InstanceId || '',
        vscode.TreeItemCollapsibleState.None
      );
    }) || [];
  } catch (error) {
    console.log(error);
    return [];
  }
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

    vscode.window.showInputBox({
      prompt: 'AWS Access Key ID',
      placeHolder: 'AWS Access Key ID',
      ignoreFocusOut: true,
    }).then((awsAccessKeyId) => {
      if (!awsAccessKeyId) {
        return;
      }

      account.awsAccessKeyId = awsAccessKeyId;
      vscode.window.showInputBox({
        prompt: 'AWS Secret Access Key',
        placeHolder: 'AWS Secret Access Key',
        ignoreFocusOut: true,
      }).then((awsSecretAccessKey) => {
        if (!awsSecretAccessKey) {
          return;
        }

        account.awsSecretAccessKey = awsSecretAccessKey;
        vscode.window.showInputBox({
          prompt: 'Region',
          placeHolder: 'Region',
          ignoreFocusOut: true,
        }).then((region) => {
          if (!region) {
            return;
          }
          account.region = region;
          this.context.globalState.update('account', account);
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
      vscode.window.showInformationMessage('Account is not configured');
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
