import * as vscode from 'vscode';

class EC2Instance extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
  }
}

export class EC2InstanceListViewProvider implements vscode.TreeDataProvider<EC2Instance> {
  getTreeItem(element: EC2Instance): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EC2Instance): Thenable<EC2Instance[]> {
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
