import * as vscode from 'vscode';

class EC2Instance extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
  }
}

class Account {
  awsAccessKeyId: string | undefined;
  awsSecretAccessKey: string | undefined;
  region: string | undefined;
}

export class EC2InstanceListViewProvider implements vscode.TreeDataProvider<EC2Instance> {
  context: vscode.ExtensionContext;
  account: Account | undefined;

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

    // Input AWS configuration
    vscode.window.showInputBox({
      prompt: 'AWS Access Key ID',
      placeHolder: 'AWS Access Key ID',
    }).then((awsAccessKeyId) => {
      if (awsAccessKeyId) {
        account.awsAccessKeyId = awsAccessKeyId;
      }

      vscode.window.showInputBox({
        prompt: 'AWS Secret Access Key',
        placeHolder: 'AWS Secret Access Key',
      }).then((awsSecretAccessKey) => {
        if (awsSecretAccessKey) {
          account.awsSecretAccessKey = awsSecretAccessKey;
        }

        vscode.window.showInputBox({
          prompt: 'Region',
          placeHolder: 'Region',
        }).then((region) => {
          if (region) {
            account.region = region;
          }

          this.account = account;
          this.refresh();
        });
      });
    });
  }

  describeAccount(): void {
    if (this.account) {
      vscode.window.showInformationMessage(
        `AWS Access Key ID: ${this.account.awsAccessKeyId}\n
         AWS Secret Access Key: ${this.account.awsSecretAccessKey}\n
         Region: ${this.account.region}`);
    } else {
      vscode.window.showInformationMessage('Account is not configured');
    }
  }

  cleanupAccount(): void {
    this.account = undefined;
  }

  getTreeItem(element: EC2Instance): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EC2Instance): Thenable<EC2Instance[]> {
    if (!this.account) {
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve([
        new EC2Instance('instance1-1', vscode.TreeItemCollapsibleState.None),
      ]);
    } else {
      return Promise.resolve([
        new EC2Instance('instance1', vscode.TreeItemCollapsibleState.Collapsed),
        new EC2Instance('instance2', vscode.TreeItemCollapsibleState.None),
        new EC2Instance('instance3', vscode.TreeItemCollapsibleState.None),
      ]);
    }
  }
}
