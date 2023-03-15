// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { EC2InstanceListViewProvider } from './view';

export function activate(context: vscode.ExtensionContext) {
	const ec2InstanceListViewProvider = new EC2InstanceListViewProvider(context);

	vscode.window.registerTreeDataProvider('ec2-farm-instance-list',
		ec2InstanceListViewProvider);

	// Configure account
	vscode.commands.registerCommand('ec2-farm.configureAccount', () => {
		ec2InstanceListViewProvider.configureAccount();
	});

	// Describe account
	vscode.commands.registerCommand('ec2-farm.describeAccount', () => {
		ec2InstanceListViewProvider.describeAccount();
	});

	// Cleanup account
	vscode.commands.registerCommand('ec2-farm.cleanupAccount', () => {
		ec2InstanceListViewProvider.cleanupAccount();
	});

	// Refresh
	vscode.commands.registerCommand('ec2-farm.refresh', () => {
		ec2InstanceListViewProvider.refresh();
	});
}

// This method is called when your extension is deactivated
export function deactivate() { }
